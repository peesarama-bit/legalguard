import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey, {
  realtime: { params: { eventsPerSecond: 10 } },
});

// ---- Database row types ----

export type ContractRow = {
  id: string;
  title: string;
  client: string;
  page_count: number;
  status: 'processing' | 'scanned' | 'draft' | 'failed';
  risk_score: number;
  total_value: number;
  raw_text: string | null;
  uploaded_at: string;
  created_at: string;
  user_id: string | null;
};

export type ClauseFlagRow = {
  id: string;
  contract_id: string;
  level: 'high' | 'medium' | 'low';
  title: string;
  excerpt: string | null;
  plain_english: string | null;
  pushback: string | null;
  clause_ref: string | null;
  created_at: string;
  user_id: string | null;
};

export type ContractTermRow = {
  id: string;
  contract_id: string;
  label: string;
  value: string;
  category: 'payment' | 'scope' | 'deadline' | 'ip' | 'termination' | 'liability';
  source: string | null;
  created_at: string;
  user_id: string | null;
};

export type InvoiceRow = {
  id: string;
  number: string;
  client: string;
  contract_id: string | null;
  amount: number;
  issued_at: string;
  due_at: string;
  status: 'paid' | 'overdue' | 'sent' | 'draft';
  days_late: number;
  created_at: string;
  user_id: string | null;
};

export type EmailDraftRow = {
  id: string;
  invoice_id: string;
  contract_id: string | null;
  tone: 'friendly' | 'professional' | 'firm' | 'final';
  subject: string | null;
  body: string | null;
  status: 'draft' | 'sent' | 'regenerated';
  created_at: string;
  user_id: string | null;
};

export type WebhookEventRow = {
  id: string;
  source: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  invoice_id: string | null;
  processed: boolean;
  received_at: string;
  user_id: string | null;
};

export type ActivityLogRow = {
  id: string;
  event_type: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  meta: Record<string, unknown> | null;
  created_at: string;
  user_id: string | null;
};

export type ClientRow = {
  id: string;
  name: string;
  email: string;
  company: string;
  relationship_health: 'good' | 'strained' | 'at_risk';
  risk_level: 'low' | 'medium' | 'high';
  total_outstanding: number;
  total_overdue: number;
  avg_payment_delay_days: number;
  notes: string;
  last_interaction_at: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};

export type ClientCommunicationRow = {
  id: string;
  client_name: string;
  direction: 'inbound' | 'outbound';
  subject: string;
  body: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  has_payment_discussion: boolean;
  has_dispute: boolean;
  has_promise: boolean;
  promise_date: string | null;
  promise_amount: number | null;
  processed: boolean;
  received_at: string;
  created_at: string;
  user_id: string | null;
};

export type PaymentPromiseRow = {
  id: string;
  client_name: string;
  invoice_id: string | null;
  invoice_number: string;
  promised_amount: number;
  promised_date: string;
  status: 'pending' | 'fulfilled' | 'missed';
  source_communication_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};

export type AiInsightRow = {
  id: string;
  client_name: string;
  insight_type: string;
  risk_level: 'low' | 'medium' | 'high';
  summary: string;
  evidence: string[] | Record<string, unknown>[];
  recommended_action: string;
  action_type: 'reminder' | 'clarification' | 'relationship' | 'firm' | 'escalation' | 'none';
  contract_id: string | null;
  invoice_id: string | null;
  generated_at: string;
  created_at: string;
  user_id: string | null;
};

// ---- Composite types for the UI ----

export type ContractWithDetails = ContractRow & {
  flags: ClauseFlagRow[];
  terms: ContractTermRow[];
};

export type ToneKey = 'friendly' | 'professional' | 'firm' | 'final';
