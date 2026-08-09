import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceKey);

async function getNimConfig(): Promise<{ apiKey: string; model: string; baseUrl: string }> {
  const apiKey = Deno.env.get("NVIDIA_NIM_API_KEY");
  if (!apiKey) throw new Error("NVIDIA_NIM_API_KEY not configured");
  return {
    apiKey,
    model: Deno.env.get("NVIDIA_NIM_MODEL") || "nvidia/nemotron-3-nano-30b-a3b",
    baseUrl: Deno.env.get("NVIDIA_NIM_BASE_URL") || "https://integrate.api.nvidia.com/v1",
  };
}

async function callNim(prompt: string, systemPrompt: string, config: { apiKey: string; model: string; baseUrl: string }): Promise<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`NIM API error (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

interface AnalysisResult {
  risk_level: "low" | "medium" | "high";
  summary: string;
  evidence: string[];
  recommended_action: string;
  action_type: "reminder" | "clarification" | "relationship" | "firm" | "escalation" | "none";
  payment_promise?: {
    detected: boolean;
    promise_date?: string;
    promise_amount?: number;
    promise_text?: string;
  };
  communication_insights?: {
    has_dispute: boolean;
    has_deliverable_blocker: boolean;
    sentiment: string;
    key_points: string[];
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { user_id, client_name, communication_text } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather all context about this client
    const [contractsRes, invoicesRes, commsRes, promisesRes] = await Promise.all([
      supabase.from("contracts").select("*").eq("user_id", user_id).ilike("client", `%${client_name || ""}%`),
      supabase.from("invoices").select("*").eq("user_id", user_id).ilike("client", `%${client_name || ""}%`),
      supabase.from("client_communications").select("*").eq("user_id", user_id).ilike("client_name", `%${client_name || ""}%`).order("received_at", { ascending: false }).limit(5),
      supabase.from("payment_promises").select("*").eq("user_id", user_id).ilike("client_name", `%${client_name || ""}%`).order("created_at", { ascending: false }),
    ]);

    const contracts = contractsRes.data ?? [];
    const invoices = (invoicesRes.data ?? []).filter((i: any) => i.status === "overdue" || i.status === "sent");
    const communications = commsRes.data ?? [];
    const promises = promisesRes.data ?? [];

    // Gather contract terms for context
    let contractTerms: { label: string; value: string; contract_title: string }[] = [];
    for (const c of contracts) {
      const { data: terms } = await supabase.from("contract_terms").select("label, value").eq("contract_id", c.id);
      if (terms) {
        contractTerms.push(...terms.map((t: any) => ({ ...t, contract_title: c.title })));
      }
    }

    const overdueInvoices = invoices.filter((i: any) => i.status === "overdue");
    const totalOverdue = overdueInvoices.reduce((s: number, i: any) => s + Number(i.amount), 0);
    const totalOutstanding = invoices.reduce((s: number, i: any) => s + Number(i.amount), 0);

    // If a new communication is provided, save it first
    let newCommId: string | null = null;
    if (communication_text && client_name) {
      const { data: newComm, error: commErr } = await supabase
        .from("client_communications")
        .insert({
          user_id,
          client_name,
          direction: "inbound",
          subject: "Analyzed communication",
          body: communication_text,
          processed: true,
        })
        .select()
        .single();
      if (!commErr && newComm) newCommId = newComm.id;
    }

    // Build context for the LLM
    const contextBlock = `CLIENT: ${client_name || "Unknown"}

CONTRACTS:
${contracts.map((c: any) => `• ${c.title} (risk: ${c.risk_score}/100, value: $${c.total_value})`).join("\n") || "None"}

CONTRACT TERMS:
${contractTerms.map(t => `• ${t.label}: ${t.value} (${t.contract_title})`).join("\n") || "None"}

INVOICES:
${invoices.map((i: any) => `• ${i.number}: $${i.amount} — ${i.status}${i.days_late > 0 ? `, ${i.days_late}d late` : ""}, due ${i.due_at}`).join("\n") || "None"}

Total outstanding: $${totalOutstanding}
Total overdue: $${totalOverdue}

PAYMENT PROMISES:
${promises.map((p: any) => `• Promised $${p.promised_amount || "N/A"} on ${p.promised_date} — status: ${p.status}`).join("\n") || "None"}

RECENT COMMUNICATIONS:
${communications.map((c: any) => `• [${c.received_at?.slice(0, 10)}] ${c.subject}: ${c.body.slice(0, 300)}`).join("\n") || "None"}

${communication_text ? `NEW COMMUNICATION TO ANALYZE:\n${communication_text}` : ""}`;

    let analysis: AnalysisResult;

    try {
      const config = await getNimConfig();
      const systemPrompt = `You are an AI Commercial Relationship Agent. Analyze the commercial context for a client and return a JSON object with this exact structure:
{
  "risk_level": "low|medium|high",
  "summary": "2-3 sentence summary of what's happening and why payment may be delayed",
  "evidence": ["fact 1", "fact 2", ...],
  "recommended_action": "specific actionable recommendation",
  "action_type": "reminder|clarification|relationship|firm|escalation|none",
  "payment_promise": {"detected": false, "promise_date": null, "promise_amount": null, "promise_text": ""},
  "communication_insights": {"has_dispute": false, "has_deliverable_blocker": false, "sentiment": "neutral", "key_points": []}
}

Guidelines:
- action_type "clarification": when there's an admin/deliverable issue blocking payment
- action_type "reminder": gentle reminder for normal delay with no issues
- action_type "relationship": important client, preserve relationship
- action_type "firm": significant delay or repeated broken promises
- action_type "escalation": all else has failed
- action_type "none": no action needed
- If a new communication contains a payment promise, set payment_promise.detected = true with the date and amount
- If there's a deliverable dispute, set communication_insights.has_deliverable_blocker = true
- Return ONLY valid JSON, no markdown.`;

      const raw = await callNim(
        `Analyze this client's commercial situation:\n\n${contextBlock}`,
        systemPrompt,
        config
      );

      analysis = JSON.parse(raw.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, ""));

      // If a payment promise was detected, save it
      if (analysis.payment_promise?.detected && analysis.payment_promise.promise_date) {
        await supabase.from("payment_promises").insert({
          user_id,
          client_name,
          promised_date: analysis.payment_promise.promise_date,
          promised_amount: analysis.payment_promise.promise_amount || 0,
          status: "pending",
          source_communication_id: newCommId,
          notes: analysis.payment_promise.promise_text || "Detected by AI analysis",
        });

        // Update the communication to mark it has a promise
        if (newCommId) {
          await supabase.from("client_communications")
            .update({ has_promise: true, has_payment_discussion: true, promise_date: analysis.payment_promise.promise_date, promise_amount: analysis.payment_promise.promise_amount || 0 })
            .eq("id", newCommId);
        }
      }

      // Update communication with dispute flags
      if (newCommId && analysis.communication_insights) {
        await supabase.from("client_communications")
          .update({
            has_dispute: analysis.communication_insights.has_dispute,
            has_payment_discussion: true,
            sentiment: analysis.communication_insights.sentiment,
          })
          .eq("id", newCommId);
      }
    } catch (llmErr) {
      // Fallback heuristic analysis
      const hasDispute = communications.some((c: any) => c.has_dispute || c.body?.toLowerCase().includes("dispute") || c.body?.toLowerCase().includes("waiting for"));
      const hasPromise = promises.some((p: any) => p.status === "pending");
      const missedPromises = promises.filter((p: any) => p.status === "missed");

      let actionType: AnalysisResult["action_type"] = "reminder";
      if (hasDispute) actionType = "clarification";
      else if (missedPromises.length > 0) actionType = "firm";
      else if (overdueInvoices.length > 0 && totalOverdue > 10000) actionType = "firm";

      analysis = {
        risk_level: overdueInvoices.length > 1 ? "high" : overdueInvoices.length === 1 ? "medium" : "low",
        summary: `${client_name} has ${overdueInvoices.length} overdue invoice(s) totaling $${totalOverdue}. ${hasDispute ? "There appears to be a deliverable dispute that may be blocking payment." : hasPromise ? "A payment promise is pending." : ""}`,
        evidence: [
          `${overdueInvoices.length} overdue invoices totaling $${totalOverdue}`,
          `${promises.length} payment promise(s) tracked`,
          `${communications.length} recent communication(s)`,
          hasDispute ? "Dispute or deliverable blocker detected" : "No disputes detected",
        ],
        recommended_action: hasDispute
          ? "Resolve the deliverable dispute before sending a payment escalation. Contact the client about the outstanding deliverable first."
          : hasPromise
          ? "Wait for the promised payment date. If it passes without payment, send a firm follow-up referencing the broken promise."
          : "Send a gentle reminder for the overdue invoice.",
        action_type: actionType,
      };
    }

    // Save AI insight to database
    await supabase.from("ai_insights").insert({
      user_id,
      client_name,
      insight_type: "risk_assessment",
      risk_level: analysis.risk_level,
      summary: analysis.summary,
      evidence: analysis.evidence || [],
      recommended_action: analysis.recommended_action,
      action_type: analysis.action_type,
    });

    // Update client record
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", user_id)
      .ilike("name", client_name)
      .maybeSingle();

    if (existingClient) {
      await supabase.from("clients").update({
        risk_level: analysis.risk_level,
        total_outstanding: totalOutstanding,
        total_overdue: totalOverdue,
        updated_at: new Date().toISOString(),
      }).eq("id", existingClient.id);
    } else {
      await supabase.from("clients").insert({
        user_id,
        name: client_name,
        risk_level: analysis.risk_level,
        total_outstanding: totalOutstanding,
        total_overdue: totalOverdue,
      });
    }

    // Log activity
    await supabase.from("activity_log").insert({
      event_type: "ai_analysis",
      description: `AI analyzed ${client_name}: risk=${analysis.risk_level}, action=${analysis.action_type}`,
      severity: analysis.risk_level === "high" ? "error" : analysis.risk_level === "medium" ? "warning" : "info",
      user_id,
    });

    return new Response(JSON.stringify({
      success: true,
      analysis,
      context: {
        contracts: contracts.length,
        invoices: invoices.length,
        overdue: overdueInvoices.length,
        total_overdue: totalOverdue,
        promises: promises.length,
        communications: communications.length,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
