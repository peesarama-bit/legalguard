import { supabase } from './supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? anonKey;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
  };
}

async function callEdgeFunction<T>(
  slug: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${supabaseUrl}/functions/v1/${slug}`;
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
    throw new Error(errBody.error || `Edge function ${slug} failed (${res.status})`);
  }

  const data = await res.json();
  return data as T;
}

async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export type ScanResult = {
  success: boolean;
  flags: { level: string; title: string; excerpt: string; plain_english: string; pushback: string; clause_ref: string }[];
  terms: { label: string; value: string; category: string; source: string }[];
  riskScore: number;
};

export type WebhookResult = {
  received: boolean;
  event_id: string;
  invoice: { id: string; number: string; client: string; amount: number; days_late: number; status: string };
  contract_terms: { label: string; value: string }[];
};

export type DraftResult = {
  success: boolean;
  draft_id: string;
  subject: string;
  body: string;
};

export type ScopeReplyResult = {
  reply: string;
};

export type AnalysisResult = {
  success: boolean;
  analysis: {
    risk_level: 'low' | 'medium' | 'high';
    summary: string;
    evidence: string[];
    recommended_action: string;
    action_type: 'reminder' | 'clarification' | 'relationship' | 'firm' | 'escalation' | 'none';
    payment_promise?: { detected: boolean; promise_date?: string; promise_amount?: number; promise_text?: string };
    communication_insights?: { has_dispute: boolean; has_deliverable_blocker: boolean; sentiment: string; key_points: string[] };
  };
  context: {
    contracts: number;
    invoices: number;
    overdue: number;
    total_overdue: number;
    promises: number;
    communications: number;
  };
};

export type ChatResult = {
  success: boolean;
  answer: string;
};

export async function scanContract(contractId: string, rawText: string): Promise<ScanResult> {
  const userId = await getCurrentUserId();
  return callEdgeFunction<ScanResult>("ai-contract-scan", {
    contract_id: contractId,
    raw_text: rawText,
    user_id: userId,
  });
}

export async function triggerWebhook(invoiceId: string): Promise<WebhookResult> {
  const userId = await getCurrentUserId();
  return callEdgeFunction<WebhookResult>("stripe-webhook", {
    invoice_id: invoiceId,
    user_id: userId,
  });
}

export async function draftEmail(invoiceId: string, tone: string): Promise<DraftResult> {
  const userId = await getCurrentUserId();
  return callEdgeFunction<DraftResult>("ai-draft-email", {
    invoice_id: invoiceId,
    tone,
    user_id: userId,
  });
}

export async function defendScope(contractId: string, clientEmail: string): Promise<ScopeReplyResult> {
  const userId = await getCurrentUserId();
  return callEdgeFunction<ScopeReplyResult>("ai-draft-email", {
    mode: "scope_defender",
    contract_id: contractId,
    client_email: clientEmail,
    user_id: userId,
  });
}

export async function analyzeClient(clientName: string, communicationText?: string): Promise<AnalysisResult> {
  const userId = await getCurrentUserId();
  return callEdgeFunction<AnalysisResult>("ai-analyze", {
    user_id: userId,
    client_name: clientName,
    communication_text: communicationText,
  });
}

export async function askBusiness(question: string): Promise<ChatResult> {
  const userId = await getCurrentUserId();
  return callEdgeFunction<ChatResult>("ai-chat", {
    user_id: userId,
    question,
  });
}
