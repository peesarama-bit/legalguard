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

type Tone = "friendly" | "professional" | "firm" | "final";

async function getNimConfig(userId?: string): Promise<{ apiKey: string; model: string; baseUrl: string }> {
  if (userId) {
    const { data: settings, error: cfgErr } = await supabase
      .from("workspace_settings")
      .select("nim_api_key, nim_model, nim_base_url")
      .eq("user_id", userId)
      .maybeSingle();
    if (cfgErr) console.error("[AI-EMAIL] settings query error:", cfgErr.message);
    if (settings?.nim_api_key) {
      return {
        apiKey: settings.nim_api_key,
        model: settings.nim_model || "nvidia/nemotron-3-nano-30b-a3b",
        baseUrl: settings.nim_base_url || "https://integrate.api.nvidia.com/v1",
      };
    }
  }
  const apiKey = Deno.env.get("NVIDIA_NIM_API_KEY");
  if (!apiKey) throw new Error("NVIDIA NIM API key not configured. Add it in Account settings or as an edge function secret.");
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

function fallbackEmail(invoiceNumber: string, clientName: string, amount: number, dueDate: string, daysLate: number, tone: Tone, terms: { label: string; value: string }[], contractTitle: string): { subject: string; body: string } {
  const dateStr = new Date(dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const currencyStr = amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const subject = `Re: Invoice ${invoiceNumber} — payment ${daysLate} days overdue`;
  const intros: Record<Tone, string> = {
    friendly: `Hi there,\n\nI hope you're doing well! Just a gentle nudge regarding invoice ${invoiceNumber}, which was due on ${dateStr}.`,
    professional: `Hello,\n\nI'm following up on invoice ${invoiceNumber} for ${currencyStr}, which was due ${dateStr} and is now ${daysLate} days past due.`,
    firm: `Hello,\n\nThis is a formal follow-up regarding invoice ${invoiceNumber}, which is ${daysLate} days overdue. Per the terms of our signed agreement, payment was due on ${dateStr}.`,
    final: `Hello,\n\nThis is a final notice regarding invoice ${invoiceNumber}. Despite previous reminders, payment of ${currencyStr} remains outstanding ${daysLate} days past the due date of ${dateStr}.`,
  };
  const termLines = terms.map((t) => `• ${t.label}: ${t.value}`).join("\n");
  const closers: Record<Tone, string> = {
    friendly: `No rush at all — if there's anything holding this up on your end, just let me know. Thanks so much!\n\nBest,\nAlex`,
    professional: `I'd appreciate an update on the status of this payment. Please let me know if there are any issues I can help resolve.\n\nBest regards,\nAlex`,
    firm: `I kindly request that this invoice be settled promptly. As outlined in our agreement, late fees may apply if payment is not received. Please confirm receipt and a payment timeline.\n\nRegards,\nAlex`,
    final: `Please remit payment within 5 business days. If this matter is not resolved, I will need to escalate to collections as permitted under our agreement.\n\nAlex`,
  };
  return { subject, body: `${intros[tone]}\n\nFor reference, our signed ${contractTitle} specifies the following terms:\n${termLines}\n\n${closers[tone]}` };
}

function fallbackScopeReply(contractTitle: string, revisionLimit: string): string {
  return `Hi there,\n\nThanks for the feedback — glad the work is landing well.\n\nI want to make sure we stay aligned with the scope we agreed on in our ${contractTitle}. The contract specifies ${revisionLimit} for revisions, and the items in your email go beyond the original deliverables.\n\nI'd love to help with all of these — here's what I'd suggest:\n1. Changes that fall within the included revision rounds I can fold in right away.\n2. Items that are new deliverables or beyond the agreed scope I'll quote separately as a quick add-on.\n\nWant me to put that together?\n\nBest,\nAlex`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { mode } = body;

    if (mode === "scope_defender") {
      const { contract_id, client_email, user_id } = body;
      if (!contract_id) {
        return new Response(JSON.stringify({ error: "contract_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: contract, error: cErr } = await supabase
        .from("contracts").select("title, raw_text").eq("id", contract_id).maybeSingle();
      if (cErr) throw cErr;

      const { data: terms, error: tErr } = await supabase
        .from("contract_terms").select("*").eq("contract_id", contract_id);
      if (tErr) console.error("[AI-EMAIL] terms query error:", tErr.message);
      const { data: flags, error: fErr } = await supabase
        .from("clause_flags").select("*").eq("contract_id", contract_id);
      if (fErr) console.error("[AI-EMAIL] flags query error:", fErr.message);

      const revisionTerm = (terms ?? []).find((t: { label: string }) => t.label === "Revision rounds");
      const contractText = contract?.raw_text || "";
      const termSummary = (terms ?? []).map((t: { label: string; value: string }) => `${t.label}: ${t.value}`).join("\n");

      let reply = "";
      let scopeFallback = false;
      try {
        const config = await getNimConfig(user_id);
        const systemPrompt = `You are a professional scope-creep defender for freelancers and agencies. The user will paste a client email asking for extra work. Write a professional, firm but friendly reply that references the contract's actual revision limits and scope terms. Do NOT be aggressive — be collaborative but clear about boundaries. Sign as "Alex". Return only the email body, no JSON.`;
        reply = await callNim(
          `Contract: ${contract?.title || "the contract"}\nContract terms:\n${termSummary}\n\nClient's email:\n${client_email}\n\nWrite a professional reply that pushes back on scope creep while referencing the contract terms.`,
          systemPrompt,
          config
        );
      } catch (llmErr) {
        console.error("[AI-EMAIL] scope LLM error:", (llmErr as Error).message);
        scopeFallback = true;
        reply = fallbackScopeReply(contract?.title ?? "contract", revisionTerm?.value ?? "2 rounds per deliverable");
      }

      const { error: logErr } = await supabase.from("activity_log").insert({
        event_type: "scope_defended",
        description: `Scope creep defender generated a reply referencing ${contract?.title ?? "contract"}`,
        severity: "info",
        user_id,
      });
      if (logErr) console.error("[AI-EMAIL] activity log error:", logErr.message);

      return new Response(JSON.stringify({ success: true, reply, fallback: scopeFallback }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: email drafting mode
    const { invoice_id, tone, user_id } = body as { invoice_id: string; tone: Tone; user_id: string };

    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "invoice_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices").select("*").eq("id", invoice_id).maybeSingle();
    if (invErr) throw invErr;
    if (!invoice) {
      return new Response(JSON.stringify({ error: "invoice not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch contract terms + communications for context
    let terms: { label: string; value: string }[] = [];
    let contractTitle = "contract";
    let communications: { subject: string; body: string; direction: string; received_at: string }[] = [];
    if (invoice.contract_id) {
      const { data: ct } = await supabase
        .from("contract_terms").select("label, value").eq("contract_id", invoice.contract_id);
      terms = (ct ?? []) as { label: string; value: string }[];
      const { data: c } = await supabase
        .from("contracts").select("title").eq("id", invoice.contract_id).maybeSingle();
      contractTitle = c?.title ?? "contract";
    }
    // Fetch recent communications from this client
    const { data: comms } = await supabase
      .from("client_communications")
      .select("subject, body, direction, received_at")
      .eq("client_name", invoice.client)
      .eq("user_id", user_id || invoice.user_id)
      .order("received_at", { ascending: false })
      .limit(3);
    communications = (comms ?? []) as typeof communications;

    // Fetch payment promises
    const { data: promises } = await supabase
      .from("payment_promises")
      .select("*")
      .eq("client_name", invoice.client)
      .eq("user_id", user_id || invoice.user_id)
      .order("created_at", { ascending: false })
      .limit(2);

    let subject = "";
    let emailBody = "";
    let draftFallback = false;

    try {
      const config = await getNimConfig(user_id || invoice.user_id);
      const toneDescriptions: Record<Tone, string> = {
        friendly: "warm, low-pressure, like a friend",
        professional: "polite but clear about obligations",
        firm: "direct, references contract obligations, professional",
        final: "escalation tone, last step before collections, serious",
      };
      const systemPrompt = `You are an AI assistant for freelancers and small agencies. Write a ${toneDescriptions[tone || "professional"]} follow-up email about an overdue invoice. Reference the actual contract terms provided. If there are recent client communications or payment promises, factor them in — if the client made a promise that hasn't been kept, mention it. If there's a dispute mentioned in communications, address it appropriately. Sign as "Alex". Return the email as plain text with the subject on the first line prefixed "Subject: ".`;
      const contextBlock = `Invoice: ${invoice.number}
Client: ${invoice.client}
Amount: $${Number(invoice.amount).toLocaleString()}
Due date: ${invoice.due_at}
Days late: ${invoice.days_late}
Contract: ${contractTitle}
Contract terms:
${terms.map(t => `• ${t.label}: ${t.value}`).join("\n")}
${communications.length > 0 ? `\nRecent client communications:\n${communications.map(c => `• [${c.direction}] ${c.subject}: ${c.body.slice(0, 2000)}`).join("\n")}` : ""}
${promises && promises.length > 0 ? `\nPayment promises:\n${promises.map((p: any) => `• Promised ${p.promised_amount ? '$' + p.promised_amount : 'payment'} on ${p.promised_date} (status: ${p.status})`).join("\n")}` : ""}`;

      const raw = await callNim(
        `Write a ${tone || "professional"} follow-up email for this overdue invoice.\n\n${contextBlock}`,
        systemPrompt,
        config
      );

      // Parse subject and body
      const lines = raw.split("\n");
      if (lines[0]?.startsWith("Subject: ")) {
        subject = lines[0].replace("Subject: ", "").trim();
        emailBody = lines.slice(1).join("\n").trim();
      } else {
        subject = `Re: Invoice ${invoice.number} — payment ${invoice.days_late} days overdue`;
        emailBody = raw.trim();
      }
    } catch (llmErr) {
      console.error("[AI-EMAIL] draft LLM error:", (llmErr as Error).message);
      draftFallback = true;
      const fb = fallbackEmail(invoice.number, invoice.client, Number(invoice.amount), invoice.due_at, invoice.days_late, tone || "professional", terms, contractTitle);
      subject = fb.subject;
      emailBody = fb.body;
    }

    // Save draft to DB
    const { data: draftRow, error: draftErr } = await supabase
      .from("email_drafts")
      .insert({
        invoice_id,
        contract_id: invoice.contract_id,
        tone: tone || "professional",
        subject,
        body: emailBody,
        status: "draft",
        user_id: user_id || invoice.user_id,
      })
      .select()
      .single();
    if (draftErr) throw draftErr;

    const { error: logErr } = await supabase.from("activity_log").insert({
      event_type: "email_drafted",
      description: `AI drafted a ${tone || "professional"} follow-up email for ${invoice.number}`,
      severity: "info",
      meta: { invoice_id, draft_id: draftRow.id },
      user_id: user_id || invoice.user_id,
    });
    if (logErr) console.error("[AI-EMAIL] activity log error:", logErr.message);

    return new Response(JSON.stringify({
      success: true,
      draft_id: draftRow.id,
      subject,
      body: emailBody,
      fallback: draftFallback,
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
