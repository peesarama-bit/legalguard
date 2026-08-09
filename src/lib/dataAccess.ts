import { supabase } from './supabase';
import type {
  ContractRow,
  ClauseFlagRow,
  ContractTermRow,
  InvoiceRow,
  EmailDraftRow,
  WebhookEventRow,
  ActivityLogRow,
  ClientRow,
  ClientCommunicationRow,
  PaymentPromiseRow,
  AiInsightRow,
  ContractWithDetails,
} from './supabase';

// ---------- Contracts ----------

export async function fetchContracts(): Promise<ContractRow[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchContractWithDetails(contractId: string): Promise<ContractWithDetails | null> {
  const { data: contract, error: e1 } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .maybeSingle();
  if (e1) throw e1;
  if (!contract) return null;

  const [{ data: flags }, { data: terms }] = await Promise.all([
    supabase.from('clause_flags').select('*').eq('contract_id', contractId).order('created_at'),
    supabase.from('contract_terms').select('*').eq('contract_id', contractId).order('created_at'),
  ]);

  return { ...(contract as ContractRow), flags: (flags ?? []) as ClauseFlagRow[], terms: (terms ?? []) as ContractTermRow[] };
}

export async function fetchAllContractDetails(): Promise<ContractWithDetails[]> {
  const { data: contracts, error } = await supabase.from('contracts').select('*').order('uploaded_at', { ascending: false });
  if (error) throw error;
  if (!contracts) return [];

  const [{ data: flags }, { data: terms }] = await Promise.all([
    supabase.from('clause_flags').select('*'),
    supabase.from('contract_terms').select('*'),
  ]);

  const flagMap = new Map<string, ClauseFlagRow[]>();
  (flags ?? []).forEach((f) => {
    const arr = flagMap.get(f.contract_id) ?? [];
    arr.push(f as ClauseFlagRow);
    flagMap.set(f.contract_id, arr);
  });

  const termMap = new Map<string, ContractTermRow[]>();
  (terms ?? []).forEach((t) => {
    const arr = termMap.get(t.contract_id) ?? [];
    arr.push(t as ContractTermRow);
    termMap.set(t.contract_id, arr);
  });

  return (contracts as ContractRow[]).map((c) => ({
    ...c,
    flags: flagMap.get(c.id) ?? [],
    terms: termMap.get(c.id) ?? [],
  }));
}

export async function createContract(title: string, client: string, rawText: string): Promise<ContractRow> {
  const { data, error } = await supabase
    .from('contracts')
    .insert({ title, client, page_count: 1, status: 'processing', risk_score: 0, total_value: 0, raw_text: rawText })
    .select()
    .single();
  if (error) throw error;
  return data as ContractRow;
}

// ---------- Invoices ----------

export async function fetchInvoices(): Promise<InvoiceRow[]> {
  const { data, error } = await supabase.from('invoices').select('*').order('due_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function markInvoiceOverdue(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'overdue' })
    .eq('id', invoiceId);
  if (error) throw error;
}

// ---------- Email Drafts ----------

export async function fetchEmailDrafts(invoiceId: string): Promise<EmailDraftRow[]> {
  const { data, error } = await supabase
    .from('email_drafts')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function saveEmailDraft(draft: {
  invoice_id: string;
  contract_id: string | null;
  tone: string;
  subject: string;
  body: string;
}): Promise<EmailDraftRow> {
  const { data, error } = await supabase
    .from('email_drafts')
    .insert({ ...draft, status: 'draft' })
    .select()
    .single();
  if (error) throw error;
  return data as EmailDraftRow;
}

// ---------- Webhook Events ----------

export async function fetchWebhookEvents(): Promise<WebhookEventRow[]> {
  const { data, error } = await supabase
    .from('webhook_events')
    .select('*')
    .order('received_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

// ---------- Activity Log ----------

export async function fetchActivityLog(limit = 30): Promise<ActivityLogRow[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ---------- Clients ----------

export async function fetchClients(): Promise<ClientRow[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ---------- Client Communications ----------

export async function fetchCommunications(clientName?: string): Promise<ClientCommunicationRow[]> {
  let query = supabase.from('client_communications').select('*').order('received_at', { ascending: false }).limit(20);
  if (clientName) query = query.ilike('client_name', `%${clientName}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function addCommunication(comm: {
  client_name: string;
  direction: string;
  subject: string;
  body: string;
}): Promise<ClientCommunicationRow> {
  const { data, error } = await supabase
    .from('client_communications')
    .insert({ ...comm, processed: true })
    .select()
    .single();
  if (error) throw error;
  return data as ClientCommunicationRow;
}

// ---------- Payment Promises ----------

export async function fetchPaymentPromises(status?: string): Promise<PaymentPromiseRow[]> {
  let query = supabase.from('payment_promises').select('*').order('promised_date', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function updatePromiseStatus(promiseId: string, status: 'pending' | 'fulfilled' | 'missed'): Promise<void> {
  const { error } = await supabase
    .from('payment_promises')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', promiseId);
  if (error) throw error;
}

// ---------- AI Insights ----------

export async function fetchAiInsights(clientName?: string): Promise<AiInsightRow[]> {
  let query = supabase.from('ai_insights').select('*').order('created_at', { ascending: false }).limit(20);
  if (clientName) query = query.ilike('client_name', `%${clientName}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ---------- Realtime subscriptions ----------

export function subscribeToTable<T>(
  table: string,
  callback: (payload: { eventType: string; row: T }) => void,
): () => void {
  const channel = supabase
    .channel(`realtime-${table}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      callback({ eventType: payload.eventType, row: (payload.new ?? payload.old) as T });
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}
