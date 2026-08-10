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

function log(stage: string, msg: string) {
  console.log(`[CONTRACT] ${stage}: ${msg}`);
}

async function getNimConfig(userId?: string): Promise<{ apiKey: string; model: string; baseUrl: string }> {
  if (userId) {
    const { data: settings } = await supabase
      .from("workspace_settings")
      .select("nim_api_key, nim_model, nim_base_url")
      .eq("user_id", userId)
      .maybeSingle();
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

async function callNim(
  prompt: string,
  systemPrompt: string,
  config: { apiKey: string; model: string; baseUrl: string },
  maxTokens: number = 4000,
): Promise<string> {
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
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`NIM API error (${res.status}): ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function safeParseJson(text: string): any | null {
  if (!text || text.trim().length === 0) return null;
  let cleaned = text.trim();
  // Strip markdown code fences
  cleaned = cleaned.replace(/^```json?\s*\n?/, "").replace(/\n?```\s*$/, "");
  // Find first { and last }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// =====================================================
// STAGE 1: Per-chunk extraction
// =====================================================

interface ChunkExtraction {
  chunk_id: number;
  page_start: number;
  page_end: number;
  contract_type?: string;
  parties?: string[];
  effective_date?: string;
  expiration_date?: string;
  contract_value?: { amount: number; currency: string; type: string; source_page: number };
  payment_terms?: { period_days: number; terms_text: string; late_fee: string; source_page: number };
  milestones?: { description: string; amount: number; due: string; source_page: number }[];
  acceptance_conditions?: string;
  scope_summary?: string;
  revision_limit?: string;
  change_control?: string;
  ip_ownership?: string;
  ip_license?: string;
  termination_notice_period?: string;
  termination_for_cause?: string;
  termination_for_convenience?: string;
  liability_cap?: string;
  liability_exclusions?: string[];
  confidentiality?: string;
  governing_law?: string;
  dispute_resolution?: string;
  auto_renewal?: boolean;
  renewal_terms?: string;
  deadlines?: { description: string; date: string; source_page: number }[];
  flags?: {
    title: string;
    severity: "high" | "medium" | "low";
    description: string;
    evidence: string;
    page: number;
    category: string;
    confidence: number;
  }[];
  terms_found?: {
    label: string;
    value: string;
    category: string;
    source_page: number;
    confidence: number;
  }[];
}

const STAGE1_SYSTEM = `You are a contract analysis AI. You analyze chunks of a contract and extract structured facts.
Return ONLY valid JSON (no markdown, no explanation) with this structure:
{
  "contract_type": "MSA|SOW|NDA|Service Agreement|Other",
  "parties": ["party names"],
  "effective_date": "date or null",
  "expiration_date": "date or null",
  "contract_value": {"amount": number, "currency": "USD", "type": "fixed|milestone|recurring|not_found", "source_page": number},
  "payment_terms": {"period_days": number, "terms_text": "e.g. Net 30", "late_fee": "description or none", "source_page": number},
  "milestones": [{"description": "...", "amount": number, "due": "date or condition", "source_page": number}],
  "acceptance_conditions": "text or null",
  "scope_summary": "text or null",
  "revision_limit": "text or null",
  "change_control": "text or null",
  "ip_ownership": "text or null",
  "ip_license": "text or null",
  "termination_notice_period": "text or null",
  "termination_for_cause": "text or null",
  "termination_for_convenience": "text or null",
  "liability_cap": "text or null",
  "liability_exclusions": ["items"],
  "confidentiality": "text or null",
  "governing_law": "text or null",
  "dispute_resolution": "text or null",
  "auto_renewal": true/false,
  "renewal_terms": "text or null",
  "deadlines": [{"description": "...", "date": "...", "source_page": number}],
  "flags": [{"title": "...", "severity": "high|medium|low", "description": "...", "evidence": "exact quote", "page": number, "category": "payment|scope|ip|termination|liability|deadline", "confidence": 0.0-1.0}],
  "terms_found": [{"label": "...", "value": "...", "category": "payment|scope|deadline|ip|termination|liability", "source_page": number, "confidence": 0.0-1.0}]
}
Rules:
- Only include fields that are actually present in this chunk. Omit fields not found.
- Every flag MUST have evidence quoted from the text and a page number.
- Every term MUST have a source_page.
- Do NOT invent information. If something is not in the text, omit it.
- Focus on: payment terms, late fees, milestone payments, scope limits, revision rounds, IP ownership, termination, liability caps, auto-renewal, acceptance criteria.`;

async function analyzeChunk(
  chunk: { chunkId: number; pageStart: number; pageEnd: number; text: string },
  config: { apiKey: string; model: string; baseUrl: string },
): Promise<ChunkExtraction> {
  const prompt = `Analyze this contract text (pages ${chunk.pageStart}-${chunk.pageEnd}):\n\n${chunk.text}`;
  log("stage1", `Analyzing chunk ${chunk.chunkId} (pages ${chunk.pageStart}-${chunk.pageEnd}, ${chunk.text.length} chars)`);
  const result = await callNim(prompt, STAGE1_SYSTEM, config, 4000);
  const parsed = safeParseJson(result);
  if (!parsed) {
    log("stage1", `WARNING: Chunk ${chunk.chunkId} returned unparseable JSON, retrying...`);
    const retry = await callNim(prompt + "\n\nIMPORTANT: Return ONLY valid JSON, no markdown.", STAGE1_SYSTEM, config, 4000);
    const retryParsed = safeParseJson(retry);
    if (!retryParsed) {
      log("stage1", `ERROR: Chunk ${chunk.chunkId} failed JSON parse after retry`);
      return { chunk_id: chunk.chunkId, page_start: chunk.pageStart, page_end: chunk.pageEnd };
    }
    return { ...retryParsed, chunk_id: chunk.chunkId, page_start: chunk.pageStart, page_end: chunk.pageEnd };
  }
  return { ...parsed, chunk_id: chunk.chunkId, page_start: chunk.pageStart, page_end: chunk.pageEnd };
}

// =====================================================
// STAGE 2: Cross-document reasoning
// =====================================================

const STAGE2_SYSTEM = `You are a contract risk analysis AI. You receive extracted facts from multiple chunks of a contract.
Your job is to synthesize them into a final unified analysis.

Return ONLY valid JSON with this structure:
{
  "contract_type": "...",
  "contract_value": {"amount": number, "currency": "USD", "type": "fixed|milestone|recurring|not_found", "source_page": number},
  "terms": [
    {"label": "Payment terms", "value": "Net 30", "category": "payment", "source_page": 7, "confidence": 0.95, "status": "found"},
    {"label": "Late payment", "value": "1.5% per month", "category": "payment", "source_page": 8, "confidence": 0.9, "status": "found"},
    {"label": "Scope", "value": "...", "category": "scope", "source_page": 3, "confidence": 0.85, "status": "found"},
    {"label": "IP ownership", "value": "...", "category": "ip", "source_page": 12, "confidence": 0.9, "status": "found"},
    {"label": "Deadline", "value": "...", "category": "deadline", "source_page": 5, "confidence": 0.8, "status": "found"},
    {"label": "Termination", "value": "...", "category": "termination", "source_page": 19, "confidence": 0.9, "status": "found"},
    {"label": "Liability cap", "value": "...", "category": "liability", "source_page": 24, "confidence": 0.85, "status": "found"}
  ],
  "flags": [
    {"title": "...", "level": "high|medium|low", "excerpt": "exact quote", "plain_english": "...", "pushback": "...", "clause_ref": "...", "source_page": 12, "category": "payment", "confidence": 0.92}
  ],
  "risk_score": 0-100
}

Rules:
- Synthesize across ALL chunks. A payment clause on page 8 may be modified by an exception on page 27.
- Every flag MUST have: excerpt (exact quote), source_page, category, confidence, plain_english, pushback.
- Every term MUST have: source_page, confidence, status ("found" or "not_found").
- If a term was not found across all chunks, set status to "not_found" and value to "Not found in document".
- Risk score: 0-30 low, 31-60 medium, 61-100 high. Base on severity and count of flags.
- Include 6-10 terms covering: payment, scope, IP, deadline, termination, liability at minimum.
- Include 1-8 flags. Only include flags with real evidence from the contract.
- Do NOT invent risks. Every flag must cite actual contract text.
- Return ONLY valid JSON, no markdown.`;

async function synthesizeAnalysis(
  chunkResults: ChunkExtraction[],
  config: { apiKey: string; model: string; baseUrl: string },
): Promise<any> {
  const summary = chunkResults.map((r) => {
    const clean: any = { ...r };
    delete clean.chunk_id;
    return JSON.stringify(clean);
  }).join("\n---\n");

  log("stage2", `Synthesizing ${chunkResults.length} chunk results (${summary.length} chars)`);
  const prompt = `Here are extracted facts from ${chunkResults.length} chunks of a contract. Synthesize them into a final analysis:\n\n${summary.slice(0, 20000)}`;
  const result = await callNim(prompt, STAGE2_SYSTEM, config, 4000);
  const parsed = safeParseJson(result);
  if (!parsed) {
    log("stage2", `WARNING: Stage 2 returned unparseable JSON, retrying...`);
    const retry = await callNim(prompt + "\n\nIMPORTANT: Return ONLY valid JSON, no markdown.", STAGE2_SYSTEM, config, 4000);
    const retryParsed = safeParseJson(retry);
    if (!retryParsed) {
      throw new Error("Stage 2 AI analysis failed: could not parse JSON after retry");
    }
    return retryParsed;
  }
  return parsed;
}

// =====================================================
// Deterministic red flag rules
// =====================================================

function deterministicFlags(fullText: string, pageTexts: string[]): any[] {
  const flags: any[] = [];
  const lower = fullText.toLowerCase();

  const findPage = (pattern: RegExp): number => {
    for (let i = 0; i < pageTexts.length; i++) {
      if (pattern.test(pageTexts[i].toLowerCase())) return i + 1;
    }
    return 1;
  };

  // Net-60 or longer payment terms
  if (/net[- ]?(60|90|120)/.test(lower) || /sixty\s*\(?\s*60\s*\)?\s*days|ninety\s*\(?\s*90\s*\)?\s*days/.test(lower)) {
    const page = findPage(/net[- ]?(60|90|120)|sixty|ninety/);
    flags.push({
      title: "Extended payment terms (Net-60+)",
      level: "high",
      excerpt: lower.match(/net[- ]?(60|90|120)/)?.[0] || "Extended payment terms detected",
      plain_english: "The client can wait 60+ days to pay, severely impacting your cash flow.",
      pushback: "Request Net-30 terms and a 1.5% monthly late fee after the due date.",
      clause_ref: "Payment terms",
      source_page: page,
      category: "payment",
      confidence: 0.95,
    });
  }

  // Unlimited revisions
  if (/unlimited\s+(revisions?|changes?|iterations?)/.test(lower)) {
    const page = findPage(/unlimited\s+(revisions?|changes?|iterations?)/);
    flags.push({
      title: "Unlimited revisions at no cost",
      level: "high",
      excerpt: "unlimited revisions",
      plain_english: "You are on the hook for endless rework with no extra pay and no cap.",
      pushback: "Cap revisions at 2-3 rounds per deliverable, with additional rounds billed hourly.",
      clause_ref: "Scope/Revisions",
      source_page: page,
      category: "scope",
      confidence: 0.95,
    });
  }

  // IP transfer before payment
  if (/intellectual\s+property.*(?:upon|before)\s+(?:delivery|completion)/.test(lower) || /all\s+(?:intellectual\s+property|ip)\s+rights?\s+shall\s+transfer/.test(lower)) {
    const page = findPage(/intellectual\s+property/);
    flags.push({
      title: "IP transfer before final payment",
      level: "medium",
      excerpt: "IP rights transfer upon delivery",
      plain_english: "They own your work the moment you hand it over, even if they never pay.",
      pushback: "IP should transfer only after full payment is received.",
      clause_ref: "IP Ownership",
      source_page: page,
      category: "ip",
      confidence: 0.85,
    });
  }

  // Vague scope
  if (/reasonably\s+request|additional\s+services\s+as\s+(?:the\s+)?client|such\s+other\s+services\s+as/.test(lower)) {
    const page = findPage(/reasonably\s+request|additional\s+services/);
    flags.push({
      title: "Vague scope definition",
      level: "low",
      excerpt: "additional services as client may reasonably request",
      plain_english: "Opens the door to scope creep — undefined and unbounded.",
      pushback: "Replace with a defined scope of work and a formal change-order process.",
      clause_ref: "Scope",
      source_page: page,
      category: "scope",
      confidence: 0.8,
    });
  }

  // Auto-renewal
  if (/auto(?:matic(?:ally)?)?\s+renew/.test(lower)) {
    const page = findPage(/auto(?:matic(?:ally)?)?\s+renew/);
    flags.push({
      title: "Automatic renewal clause",
      level: "medium",
      excerpt: "automatically renews",
      plain_english: "The contract renews automatically unless you actively cancel within a specific window.",
      pushback: "Require affirmative consent for renewal and add a 30-day cancellation notice window.",
      clause_ref: "Renewal",
      source_page: page,
      category: "termination",
      confidence: 0.85,
    });
  }

  // Unlimited liability
  if (/unlimited\s+liability|liability\s+shall\s+not\s+be\s+limited/.test(lower)) {
    const page = findPage(/unlimited\s+liability|liability\s+shall\s+not\s+be\s+limited/);
    flags.push({
      title: "Unlimited liability exposure",
      level: "high",
      excerpt: "unlimited liability",
      plain_english: "You have no cap on financial liability — a single claim could bankrupt you.",
      pushback: "Cap liability at the total contract value or 12 months of fees.",
      clause_ref: "Liability",
      source_page: page,
      category: "liability",
      confidence: 0.95,
    });
  }

  return flags;
}

// =====================================================
// Main handler
// =====================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const aiStartTime = performance.now();

  try {
    const body = await req.json();
    const { contract_id, chunks, page_count, user_id, raw_text } = body;

    if (!contract_id) {
      return new Response(JSON.stringify({ error: "contract_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("start", `contract_id=${contract_id}, page_count=${page_count}, chunks=${chunks?.length || 0}`);

    // Accept either chunks or raw_text (backward compat)
    let chunkList: { chunkId: number; pageStart: number; pageEnd: number; text: string }[] = [];
    let fullText = "";

    if (chunks && Array.isArray(chunks) && chunks.length > 0) {
      chunkList = chunks;
      fullText = chunks.map((c: any) => c.text).join("\n");
      log("chunks", `Received ${chunkList.length} chunks, total ${fullText.length} chars`);
    } else if (raw_text) {
      // Legacy mode: single text block
      fullText = raw_text;
      chunkList = [{ chunkId: 0, pageStart: 1, pageEnd: page_count || 1, text: raw_text }];
      log("legacy", `Received raw_text, ${raw_text.length} chars`);
    } else {
      return new Response(JSON.stringify({ error: "Either chunks or raw_text is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update contract status
    await supabase.from("contracts").update({
      analysis_status: "analyzing",
      extraction_status: "completed",
    }).eq("id", contract_id);

    const config = await getNimConfig(user_id);
    log("config", `model=${config.model}, baseUrl=${config.baseUrl}`);

    // STAGE 1: Analyze each chunk
    log("stage1", `Starting per-chunk analysis of ${chunkList.length} chunks`);
    const chunkResults: ChunkExtraction[] = [];
    for (const chunk of chunkList) {
      try {
        const result = await analyzeChunk(chunk, config);
        chunkResults.push(result);
        log("stage1", `Chunk ${chunk.chunkId} done: ${result.flags?.length || 0} flags, ${result.terms_found?.length || 0} terms`);
      } catch (err) {
        log("stage1", `ERROR on chunk ${chunk.chunkId}: ${(err as Error).message}`);
        chunkResults.push({ chunk_id: chunk.chunkId, page_start: chunk.pageStart, page_end: chunk.pageEnd });
      }
    }

    // STAGE 2: Synthesize across all chunks
    log("stage2", "Starting cross-document synthesis");
    let synthesis: any;
    try {
      synthesis = await synthesizeAnalysis(chunkResults, config);
      log("stage2", `Synthesis complete: ${synthesis.flags?.length || 0} flags, ${synthesis.terms?.length || 0} terms, risk=${synthesis.risk_score}`);
    } catch (err) {
      log("stage2", `ERROR: ${(err as Error).message}`);
      throw new Error(`AI synthesis failed: ${(err as Error).message}`);
    }

    // Merge deterministic flags with AI flags
    const pageTexts = chunkList.map((c) => c.text);
    const detFlags = deterministicFlags(fullText, pageTexts);
    const aiFlags = (synthesis.flags || []).map((f: any) => ({
      level: f.level || "medium",
      title: f.title || "Untitled flag",
      excerpt: f.excerpt || f.evidence || "",
      plain_english: f.plain_english || f.description || "",
      pushback: f.pushback || "",
      clause_ref: f.clause_ref || f.category || "",
      source_page: f.source_page || f.page || null,
      category: f.category || "general",
      confidence: f.confidence || 0.8,
    }));

    // Deduplicate flags by title (prefer AI flags, add deterministic ones not already present)
    const aiFlagTitles = new Set(aiFlags.map((f: any) => f.title.toLowerCase()));
    const extraDetFlags = detFlags.filter((f) => !aiFlagTitles.has(f.title.toLowerCase()));
    const allFlags = [...aiFlags, ...extraDetFlags];
    log("flags", `AI flags: ${aiFlags.length}, deterministic flags: ${detFlags.length}, merged: ${allFlags.length}`);

    // Process terms
    const allTerms = (synthesis.terms || []).map((t: any) => ({
      label: t.label || "Unknown",
      value: t.value || "Not found in document",
      category: t.category || "payment",
      source: t.clause_ref || t.source_page ? `Page ${t.source_page}` : "",
      source_page: t.source_page || null,
      confidence: t.confidence || 0.8,
      status: t.status || (t.value && t.value !== "Not found in document" ? "found" : "not_found"),
    }));
    log("terms", `${allTerms.length} terms extracted`);

    // Calculate risk score
    const riskScore = Math.min(100, Math.max(0, synthesis.risk_score || 0));
    const contractValue = synthesis.contract_value?.amount || 0;
    const currency = synthesis.contract_value?.currency || "USD";
    const contractType = synthesis.contract_type || "";

    const aiDurationMs = Math.round(performance.now() - aiStartTime);
    log("complete", `risk=${riskScore}, value=${contractValue} ${currency}, flags=${allFlags.length}, terms=${allTerms.length}, ai_duration=${aiDurationMs}ms`);

    // Update contract
    const { error: updateErr } = await supabase
      .from("contracts")
      .update({
        status: "scanned",
        risk_score: riskScore,
        raw_text: fullText,
        total_value: contractValue,
        currency,
        contract_type: contractType,
        analysis_status: "completed",
        extraction_status: "completed",
        analyzed_at: new Date().toISOString(),
        ai_duration_ms: aiDurationMs,
      })
      .eq("id", contract_id);
    if (updateErr) throw updateErr;

    // Delete old flags/terms
    await supabase.from("clause_flags").delete().eq("contract_id", contract_id);
    await supabase.from("contract_terms").delete().eq("contract_id", contract_id);

    // Insert flags
    if (allFlags.length > 0) {
      const flagRows = allFlags.map((f) => ({
        contract_id,
        user_id,
        level: f.level,
        title: f.title,
        excerpt: f.excerpt,
        plain_english: f.plain_english,
        pushback: f.pushback,
        clause_ref: f.clause_ref,
        source_page: f.source_page,
        category: f.category,
        confidence: f.confidence,
      }));
      const { error: flagErr } = await supabase.from("clause_flags").insert(flagRows);
      if (flagErr) throw flagErr;
    }

    // Insert terms
    if (allTerms.length > 0) {
      const termRows = allTerms.map((t) => ({
        contract_id,
        user_id,
        label: t.label,
        value: t.value,
        category: t.category,
        source: t.source,
        source_page: t.source_page,
        confidence: t.confidence,
        status: t.status,
      }));
      const { error: termErr } = await supabase.from("contract_terms").insert(termRows);
      if (termErr) throw termErr;
    }

    // Log activity
    const contractRow = await supabase.from("contracts").select("title").eq("id", contract_id).maybeSingle();
    const title = contractRow.data?.title ?? "Contract";
    await supabase.from("activity_log").insert({
      event_type: "contract_scanned",
      description: `${title} scanned: ${allFlags.length} flags, ${allTerms.length} terms extracted`,
      severity: allFlags.some((f) => f.level === "high") ? "warning" : "success",
      user_id,
    });

    return new Response(JSON.stringify({
      success: true,
      flags: allFlags,
      terms: allTerms,
      riskScore,
      contractValue,
      currency,
      contractType,
      diagnostics: {
        pageCount: page_count || chunkList.length,
        chunkCount: chunkList.length,
        aiDurationMs,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    log("error", (err as Error).message);
    // Update contract with error
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body.contract_id) {
        await supabase.from("contracts").update({
          status: "failed",
          analysis_status: "failed",
          processing_error: (err as Error).message,
        }).eq("id", body.contract_id);
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
