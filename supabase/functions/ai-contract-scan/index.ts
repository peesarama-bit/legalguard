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
      max_tokens: 2000,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`NIM API error (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

interface FlagResult {
  level: "high" | "medium" | "low";
  title: string;
  excerpt: string;
  plain_english: string;
  pushback: string;
  clause_ref: string;
}

interface TermResult {
  label: string;
  value: string;
  category: "payment" | "scope" | "deadline" | "ip" | "termination" | "liability";
  source: string;
}

// Fallback heuristic analysis if LLM fails
function heuristicAnalysis(text: string): { flags: FlagResult[]; terms: TermResult[]; riskScore: number } {
  const lower = text.toLowerCase();
  const flags: FlagResult[] = [];
  const terms: TermResult[] = [];

  if (lower.includes("unlimited") && lower.includes("revision")) {
    flags.push({ level: "high", title: "Unlimited revisions at no cost", excerpt: "Contractor agrees to provide unlimited revisions...", plain_english: "You are on the hook for endless rework with no extra pay and no cap.", pushback: "Cap revisions at 2 rounds per deliverable, with additional rounds billed hourly.", clause_ref: "§4.3" });
  }
  if (lower.includes("net-60") || lower.includes("net 60") || lower.includes("sixty (60) days")) {
    flags.push({ level: "high", title: "Payment terms: Net-60 with no late penalty", excerpt: "Client shall remit payment within sixty (60) days...", plain_english: "They can sit on your invoice for 2 full months with zero penalty.", pushback: "Request Net-30 terms and a 1.5% monthly late fee after the due date.", clause_ref: "§6.1" });
  }
  if (lower.includes("intellectual property") && lower.includes("upon delivery")) {
    flags.push({ level: "medium", title: "Broad IP assignment before final payment", excerpt: "All intellectual property rights shall transfer to Client upon delivery...", plain_english: "They own your work the moment you hand it over — even if they never pay.", pushback: "IP should transfer only after full payment is received.", clause_ref: "§7.2" });
  }
  if (lower.includes("reasonably request") || lower.includes("additional services as")) {
    flags.push({ level: "low", title: "Vague scope definition", excerpt: "Contractor will perform such additional services as Client may reasonably request...", plain_english: "Opens the door to scope creep — undefined and unbounded.", pushback: "Replace with a defined scope of work and a change-order process.", clause_ref: "§3.5" });
  }

  const netMatch = lower.match(/net[- ]?(\d+)/);
  terms.push({ label: "Net terms", value: netMatch ? `Net-${netMatch[1]}` : "Not specified", category: "payment", source: "§6.1" });
  terms.push({ label: "Late fee", value: lower.includes("late fee") ? "Specified in contract" : "None specified", category: "payment", source: "§6.1" });
  if (lower.includes("50%") && lower.includes("delivery")) {
    terms.push({ label: "Payment schedule", value: "50% upfront, 50% on delivery", category: "payment", source: "§6.1" });
  }
  terms.push({ label: "Revision rounds", value: lower.includes("unlimited") ? "Unlimited" : "Not specified", category: "scope", source: "§4.3" });
  if (lower.includes("intellectual property")) {
    terms.push({ label: "IP ownership", value: lower.includes("upon full payment") ? "Transfers on full payment" : "Transfers on delivery (pre-payment)", category: "ip", source: "§7.2" });
  }

  const riskMap = { high: 25, medium: 12, low: 5 };
  const riskScore = Math.min(100, flags.reduce((s, f) => s + riskMap[f.level], 15));
  return { flags, terms, riskScore };
}

async function llmAnalyzeContract(text: string, config: { apiKey: string; model: string; baseUrl: string }): Promise<{ flags: FlagResult[]; terms: TermResult[]; riskScore: number } | null> {
  const systemPrompt = `You are a contract analysis AI for freelancers and small agencies. Analyze the contract text and return a JSON object with this exact structure:
{
  "flags": [{"level": "high|medium|low", "title": "short title", "excerpt": "exact quote from contract", "plain_english": "what this means in simple terms", "pushback": "what to counter-negotiate", "clause_ref": "section reference like §4.3"}],
  "terms": [{"label": "term name", "value": "the value", "category": "payment|scope|deadline|ip|termination|liability", "source": "section ref"}],
  "risk_score": 0-100
}
Rules:
- Find 1-6 flags. Focus on payment terms, revision limits, IP transfer, scope creep, non-competes.
- Extract 3-10 key terms.
- Risk score: 0-30 low, 31-60 medium, 61-100 high. Base on severity of flags.
- Return ONLY valid JSON, no markdown, no explanation.`;

  try {
    const result = await callNim(
      `Analyze this contract text:\n\n${text.slice(0, 8000)}`,
      systemPrompt,
      config
    );
    const parsed = JSON.parse(result.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, ""));
    return {
      flags: (parsed.flags || []).map((f: any) => ({
        level: f.level || "medium",
        title: f.title || "Untitled flag",
        excerpt: f.excerpt || "",
        plain_english: f.plain_english || "",
        pushback: f.pushback || "",
        clause_ref: f.clause_ref || "",
      })),
      terms: (parsed.terms || []).map((t: any) => ({
        label: t.label || "Unknown",
        value: t.value || "Not specified",
        category: t.category || "payment",
        source: t.source || "",
      })),
      riskScore: Math.min(100, Math.max(0, parsed.risk_score || 0)),
    };
  } catch {
    return null; // fall back to heuristic
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // ---- Contract scan mode ----
    const { contract_id, raw_text, user_id } = body;

    if (!contract_id) {
      return new Response(JSON.stringify({ error: "contract_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!raw_text) {
      return new Response(JSON.stringify({ error: "raw_text is required — upload a contract to scan" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = raw_text;

    // Try real LLM analysis, fall back to heuristics
    let analysis: { flags: FlagResult[]; terms: TermResult[]; riskScore: number };
    try {
      const config = await getNimConfig();
      const llmResult = await llmAnalyzeContract(text, config);
      if (llmResult) {
        analysis = llmResult;
      } else {
        analysis = heuristicAnalysis(text);
      }
    } catch {
      analysis = heuristicAnalysis(text);
    }

    const { flags, terms, riskScore } = analysis;

    // Update contract
    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ status: "scanned", risk_score: riskScore, raw_text: text })
      .eq("id", contract_id);
    if (updateErr) throw updateErr;

    // Delete old flags/terms for this contract (in case of rescan)
    await supabase.from("clause_flags").delete().eq("contract_id", contract_id);
    await supabase.from("contract_terms").delete().eq("contract_id", contract_id);

    // Insert flags
    if (flags.length > 0) {
      const flagRows = flags.map((f) => ({ ...f, contract_id, user_id }));
      const { error: flagErr } = await supabase.from("clause_flags").insert(flagRows);
      if (flagErr) throw flagErr;
    }

    // Insert terms
    if (terms.length > 0) {
      const termRows = terms.map((t) => ({ ...t, contract_id, user_id }));
      const { error: termErr } = await supabase.from("contract_terms").insert(termRows);
      if (termErr) throw termErr;
    }

    // Log activity
    const contractRow = await supabase.from("contracts").select("title").eq("id", contract_id).maybeSingle();
    const title = contractRow.data?.title ?? "Contract";
    await supabase.from("activity_log").insert({
      event_type: "contract_scanned",
      description: `${title} scanned: ${flags.length} flags, ${terms.length} terms extracted`,
      severity: flags.some((f) => f.level === "high") ? "warning" : "success",
      user_id,
    });

    return new Response(JSON.stringify({ success: true, flags, terms, riskScore }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
