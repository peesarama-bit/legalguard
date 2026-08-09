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
      temperature: 0.4,
      max_tokens: 1200,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`NIM API error (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { user_id, question } = await req.json();

    if (!user_id || !question) {
      return new Response(JSON.stringify({ error: "user_id and question are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather all user's business data
    const [contractsRes, invoicesRes, promisesRes, commsRes, insightsRes, clientsRes] = await Promise.all([
      supabase.from("contracts").select("title, client, status, risk_score, total_value").eq("user_id", user_id),
      supabase.from("invoices").select("number, client, amount, status, days_late, due_at").eq("user_id", user_id),
      supabase.from("payment_promises").select("*").eq("user_id", user_id),
      supabase.from("client_communications").select("client_name, subject, body, sentiment, has_dispute, has_promise, received_at").eq("user_id", user_id).order("received_at", { ascending: false }).limit(10),
      supabase.from("ai_insights").select("client_name, risk_level, summary, recommended_action, action_type").eq("user_id", user_id).order("created_at", { ascending: false }).limit(5),
      supabase.from("clients").select("name, risk_level, total_outstanding, total_overdue, relationship_health").eq("user_id", user_id),
    ]);

    const contracts = contractsRes.data ?? [];
    const invoices = invoicesRes.data ?? [];
    const promises = promisesRes.data ?? [];
    const communications = commsRes.data ?? [];
    const insights = insightsRes.data ?? [];
    const clients = clientsRes.data ?? [];

    // Build context
    const overdueInvoices = invoices.filter((i: any) => i.status === "overdue");
    const missedPromises = promises.filter((p: any) => p.status === "missed");
    const pendingPromises = promises.filter((p: any) => p.status === "pending");
    const disputedClients = communications.filter((c: any) => c.has_dispute).map((c: any) => c.client_name);

    const contextBlock = `BUSINESS DATA SNAPSHOT:

CLIENTS:
${clients.map((c: any) => `• ${c.name}: risk=${c.risk_level}, outstanding=$${c.total_outstanding}, overdue=$${c.total_overdue}, health=${c.relationship_health}`).join("\n") || "None"}

CONTRACTS:
${contracts.map((c: any) => `• ${c.title} (${c.client}): risk=${c.risk_score}/100, value=$${c.total_value}, status=${c.status}`).join("\n") || "None"}

INVOICES:
${invoices.map((i: any) => `• ${i.number} (${i.client}): $${i.amount}, ${i.status}${i.days_late > 0 ? `, ${i.days_late}d late` : ""}`).join("\n") || "None"}

Overdue total: $${overdueInvoices.reduce((s: number, i: any) => s + Number(i.amount), 0)}

PAYMENT PROMISES:
${promises.map((p: any) => `• ${p.client_name}: promised $${p.promised_amount || "N/A"} on ${p.promised_date} — ${p.status}`).join("\n") || "None"}

RECENT COMMUNICATIONS:
${communications.map((c: any) => `• [${c.received_at?.slice(0, 10)}] ${c.client_name}: ${c.subject} (sentiment: ${c.sentiment}, dispute: ${c.has_dispute})`).join("\n") || "None"}

AI INSIGHTS:
${insights.map((i: any) => `• ${i.client_name}: ${i.summary} → Action: ${i.recommended_action}`).join("\n") || "None"}

DISPUTED CLIENTS: ${disputedClients.length > 0 ? [...new Set(disputedClients)].join(", ") : "None"}
MISSED PROMISES: ${missedPromises.length}
PENDING PROMISES: ${pendingPromises.length}`;

    let answer = "";

    try {
      const config = await getNimConfig();
      const systemPrompt = `You are LegalGuard, an AI Commercial Relationship Agent. You help freelancers and small agencies understand their commercial relationships — contracts, invoices, payments, and client communications. Answer questions using the business data provided. Be specific, cite actual invoice numbers, amounts, dates, and contract terms. Keep answers concise (3-6 sentences). If data is insufficient, say what you can see and what you'd need.`;
      answer = await callNim(
        `BUSINESS CONTEXT:\n${contextBlock}\n\nUSER QUESTION: ${question}`,
        systemPrompt,
        config
      );
    } catch {
      // Fallback: simple data-based answer
      if (question.toLowerCase().includes("why") && question.toLowerCase().includes("paid")) {
        const clientMatch = clients.find((c: any) => question.toLowerCase().includes(c.name.toLowerCase().split(" ")[0]));
        if (clientMatch) {
          const clientOverdue = overdueInvoices.filter((i: any) => i.client === clientMatch.name);
          const clientComms = communications.filter((c: any) => c.client_name === clientMatch.name);
          const clientPromises = promises.filter((p: any) => p.client_name === clientMatch.name);
          answer = `${clientMatch.name} has ${clientOverdue.length} overdue invoice(s) totaling $${clientOverdue.reduce((s: number, i: any) => s + Number(i.amount), 0)}. `;
          if (clientComms.some((c: any) => c.has_dispute)) {
            answer += "There is a deliverable dispute that may be blocking payment. ";
          }
          if (clientPromises.length > 0) {
            answer += `A payment promise was made for ${clientPromises[0].promised_date} (status: ${clientPromises[0].status}). `;
          }
          answer += `Risk level: ${clientMatch.risk_level}.`;
        } else {
          answer = `I couldn't find a specific client matching your question. Your overdue invoices total $${overdueInvoices.reduce((s: number, i: any) => s + Number(i.amount), 0)} across ${overdueInvoices.length} invoice(s).`;
        }
      } else if (question.toLowerCase().includes("at risk") || question.toLowerCase().includes("most at risk")) {
        const highRisk = clients.filter((c: any) => c.risk_level === "high");
        answer = highRisk.length > 0
          ? `Your most at-risk clients are: ${highRisk.map((c: any) => `${c.name} ($${c.total_overdue} overdue)`).join(", ")}.`
          : "No clients are currently flagged as high risk.";
      } else if (question.toLowerCase().includes("promise")) {
        answer = `You have ${pendingPromises.length} pending payment promise(s) and ${missedPromises.length} missed promise(s). ${pendingPromises.map((p: any) => `${p.client_name} promised to pay $${p.promised_amount || "N/A"} on ${p.promised_date}`).join(". ")}`;
      } else if (question.toLowerCase().includes("dispute")) {
        const disputed = [...new Set(disputedClients)];
        answer = disputed.length > 0
          ? `Clients with unresolved disputes: ${disputed.join(", ")}.`
          : "No disputes detected in recent communications.";
      } else {
        answer = `You have ${contracts.length} contracts, ${invoices.length} invoices (${overdueInvoices.length} overdue totaling $${overdueInvoices.reduce((s: number, i: any) => s + Number(i.amount), 0)}), and ${promises.length} payment promises tracked.`;
      }
    }

    // Log the chat
    await supabase.from("activity_log").insert({
      event_type: "ai_chat",
      description: `User asked: "${question.slice(0, 80)}"`,
      severity: "info",
      user_id,
    });

    return new Response(JSON.stringify({
      success: true,
      answer,
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
