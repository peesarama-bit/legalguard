import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Clock,
  Mail,
  Handshake,
  Sparkles,
  ChevronRight,
  ArrowLeft,
  Activity,
  MessageSquare,
  FileText,
  Receipt,
} from 'lucide-react';
import type { ClientRow, ClientCommunicationRow, PaymentPromiseRow, AiInsightRow, InvoiceRow, ContractRow } from '@/lib/supabase';
import { fetchClients, fetchCommunications, fetchPaymentPromises, fetchAiInsights, fetchInvoices, fetchContracts } from '@/lib/dataAccess';
import { analyzeClient } from '@/lib/api';
import { currency, dateLabel, riskColor } from '@/lib/format';

type RiskLevel = 'low' | 'medium' | 'high';

const riskStyles: Record<RiskLevel, { bg: string; text: string; border: string; label: string }> = {
  high: { bg: 'bg-danger-50', text: 'text-danger-700', border: 'border-danger-200', label: 'High risk' },
  medium: { bg: 'bg-warning-50', text: 'text-warning-700', border: 'border-warning-200', label: 'Medium' },
  low: { bg: 'bg-primary-50', text: 'text-primary-700', border: 'border-primary-200', label: 'Low risk' },
};

const healthStyles: Record<string, { bg: string; text: string; label: string }> = {
  good: { bg: 'bg-primary-50', text: 'text-primary-700', label: 'Healthy' },
  strained: { bg: 'bg-warning-50', text: 'text-warning-700', label: 'Strained' },
  at_risk: { bg: 'bg-danger-50', text: 'text-danger-700', label: 'At risk' },
};

const actionTypeLabels: Record<string, string> = {
  reminder: 'Send reminder',
  clarification: 'Clarify deliverable',
  relationship: 'Repair relationship',
  firm: 'Firm follow-up',
  escalation: 'Escalate',
  none: 'No action needed',
};

export default function Clients() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [communications, setCommunications] = useState<ClientCommunicationRow[]>([]);
  const [promises, setPromises] = useState<PaymentPromiseRow[]>([]);
  const [insights, setInsights] = useState<AiInsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AiInsightRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newCommText, setNewCommText] = useState('');
  const [showCommInput, setShowCommInput] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, inv, con] = await Promise.all([fetchClients(), fetchInvoices(), fetchContracts()]);
      setClients(c);
      setInvoices(inv);
      setContracts(con);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadClientDetail = useCallback(async (clientName: string) => {
    setDetailLoading(true);
    setSelectedClient(clientName);
    setAnalysis(null);
    try {
      const [comms, proms, ins] = await Promise.all([
        fetchCommunications(clientName),
        fetchPaymentPromises(),
        fetchAiInsights(clientName),
      ]);
      setCommunications(comms);
      setPromises(proms.filter((p) => p.client_name === clientName));
      setInsights(ins);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function runAnalysis(clientName: string) {
    setAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeClient(clientName, newCommText || undefined);
      if (result.analysis) {
        const newInsight: AiInsightRow = {
          id: 'temp-' + Date.now(),
          client_name: clientName,
          insight_type: 'risk_assessment',
          risk_level: result.analysis.risk_level,
          summary: result.analysis.summary,
          evidence: result.analysis.evidence || [],
          recommended_action: result.analysis.recommended_action,
          action_type: result.analysis.action_type,
          contract_id: null,
          invoice_id: null,
          generated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          user_id: null,
        };
        setAnalysis(newInsight);
        if (newCommText) {
          setNewCommText('');
          setShowCommInput(false);
          loadClientDetail(clientName);
        }
        load();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const selected = clients.find((c) => c.name === selectedClient);
  const clientInvoices = selectedClient ? invoices.filter((i) => i.client === selectedClient) : [];
  const clientContracts = selectedClient ? contracts.filter((c) => c.client === selectedClient) : [];
  const latestInsight = analysis || insights[0] || null;
  const insightRisk = latestInsight?.risk_level || selected?.risk_level || 'low';
  const rs = riskStyles[insightRisk as RiskLevel] || riskStyles.low;

  // Detail view
  if (selectedClient && selected) {
    return (
      <div className="animate-fade-in space-y-6">
        <button onClick={() => setSelectedClient(null)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" /> All clients
        </button>

        {error && (
          <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{error}</div>
        )}

        {/* Client header */}
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
          <div className={`px-6 py-5 ${rs.bg} border-b ${rs.border}`}>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="font-serif text-2xl font-semibold text-ink-900">{selected.name}</h1>
                <p className="mt-1 text-sm text-ink-500">{selected.email || 'No email on file'}</p>
              </div>
              <div className="flex gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${rs.bg} ${rs.text} border ${rs.border}`}>
                  {rs.label}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${(healthStyles[selected.relationship_health] || healthStyles.good).bg} ${(healthStyles[selected.relationship_health] || healthStyles.good).text}`}>
                  {(healthStyles[selected.relationship_health] || healthStyles.good).label}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-ink-100 sm:grid-cols-4">
            <div className="px-5 py-4">
              <p className="text-xs text-ink-400">Outstanding</p>
              <p className="mt-1 font-serif text-xl font-semibold text-ink-900">{currency(Number(selected.total_outstanding))}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-ink-400">Overdue</p>
              <p className="mt-1 font-serif text-xl font-semibold text-danger-600">{currency(Number(selected.total_overdue))}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-ink-400">Avg delay</p>
              <p className="mt-1 font-serif text-xl font-semibold text-ink-900">{selected.avg_payment_delay_days}d</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-ink-400">Last contact</p>
              <p className="mt-1 font-serif text-xl font-semibold text-ink-900">{selected.last_interaction_at ? dateLabel(selected.last_interaction_at.slice(0, 10)) : '—'}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column: AI insight + actions */}
          <div className="space-y-5 lg:col-span-2">
            {/* AI Insight */}
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary-600" />
                <h3 className="text-sm font-semibold text-ink-900">AI Risk Assessment</h3>
                {latestInsight && (
                  <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${riskStyles[(latestInsight.risk_level as RiskLevel)]?.bg || ''} ${riskStyles[(latestInsight.risk_level as RiskLevel)]?.text || ''}`}>
                    {latestInsight.risk_level}
                  </span>
                )}
              </div>

              {detailLoading ? (
                <div className="mt-4 space-y-2.5">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-3 rounded shimmer-bg" style={{ width: `${85 - i * 10}%` }} />)}
                </div>
              ) : latestInsight ? (
                <div className="mt-4">
                  <p className="text-sm leading-relaxed text-ink-700">{latestInsight.summary}</p>

                  {Array.isArray(latestInsight.evidence) && latestInsight.evidence.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Evidence</p>
                      {(latestInsight.evidence as string[]).map((ev, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-ink-600">
                          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300" />
                          <span>{ev}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={`mt-4 rounded-xl border p-4 ${rs.border} ${rs.bg}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Recommended action</p>
                    <p className="mt-1.5 text-sm font-medium text-ink-900">{latestInsight.recommended_action}</p>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1 text-xs font-semibold text-ink-700">
                      <Activity className="h-3.5 w-3.5" /> {actionTypeLabels[latestInsight.action_type] || latestInsight.action_type}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-ink-400">No AI analysis yet. Run an analysis to get a risk assessment and recommended action.</p>
              )}

              {/* Analysis controls */}
              <div className="mt-5 border-t border-ink-100 pt-4">
                {!showCommInput ? (
                  <button onClick={() => runAnalysis(selected.name)} disabled={analyzing}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50">
                    {analyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : <><Sparkles className="h-4 w-4" /> Run AI analysis</>}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <textarea
                      value={newCommText}
                      onChange={(e) => setNewCommText(e.target.value)}
                      placeholder="Paste a client email or message to analyze…"
                      className="w-full rounded-xl border border-ink-200 p-3 text-sm text-ink-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                      rows={4}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => runAnalysis(selected.name)} disabled={analyzing}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50">
                        {analyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : <><Sparkles className="h-4 w-4" /> Analyze communication</>}
                      </button>
                      <button onClick={() => { setShowCommInput(false); setNewCommText(''); }}
                        className="rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-medium text-ink-600 hover:bg-ink-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {!showCommInput && (
                  <button onClick={() => setShowCommInput(true)}
                    className="mt-2 w-full text-center text-xs font-medium text-ink-400 hover:text-ink-600">
                    + Analyze a new client communication
                  </button>
                )}
              </div>
            </div>

            {/* Invoices */}
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-ink-600" />
                <h3 className="text-sm font-semibold text-ink-900">Invoices ({clientInvoices.length})</h3>
              </div>
              <div className="mt-4 space-y-2">
                {clientInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg border border-ink-100 p-3">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{inv.number}</p>
                      <p className="text-xs text-ink-400">Due {dateLabel(inv.due_at)} · {inv.status}{inv.days_late > 0 ? ` · ${inv.days_late}d late` : ''}</p>
                    </div>
                    <p className="font-serif text-sm font-semibold text-ink-900">{currency(Number(inv.amount))}</p>
                  </div>
                ))}
                {clientInvoices.length === 0 && <p className="py-3 text-center text-xs text-ink-400">No invoices</p>}
              </div>
            </div>

            {/* Contracts */}
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-ink-600" />
                <h3 className="text-sm font-semibold text-ink-900">Contracts ({clientContracts.length})</h3>
              </div>
              <div className="mt-4 space-y-2">
                {clientContracts.map((c) => {
                  const rc = riskColor(c.risk_score);
                  return (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-ink-100 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900">{c.title}</p>
                        <p className="text-xs text-ink-400">{c.page_count} pages · {c.status}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${rc.bg} ${rc.text}`}>{c.risk_score}/100</span>
                    </div>
                  );
                })}
                {clientContracts.length === 0 && <p className="py-3 text-center text-xs text-ink-400">No contracts</p>}
              </div>
            </div>
          </div>

          {/* Right column: communications + promises */}
          <div className="space-y-5">
            {/* Payment promises */}
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Handshake className="h-5 w-5 text-ink-600" />
                <h3 className="text-sm font-semibold text-ink-900">Payment promises</h3>
              </div>
              <div className="mt-4 space-y-2.5">
                {promises.map((p) => {
                  const statusStyle = p.status === 'pending' ? 'bg-warning-50 text-warning-700' : p.status === 'fulfilled' ? 'bg-primary-50 text-primary-700' : 'bg-danger-50 text-danger-700';
                  return (
                    <div key={p.id} className="rounded-lg border border-ink-100 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-ink-900">{p.invoice_number || 'General'}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyle}`}>{p.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        Promised {p.promised_amount ? currency(Number(p.promised_amount)) : 'payment'} on {dateLabel(p.promised_date)}
                      </p>
                      {p.notes && <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{p.notes}</p>}
                    </div>
                  );
                })}
                {promises.length === 0 && <p className="py-3 text-center text-xs text-ink-400">No promises tracked</p>}
              </div>
            </div>

            {/* Communications */}
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-ink-600" />
                <h3 className="text-sm font-semibold text-ink-900">Communications ({communications.length})</h3>
              </div>
              <div className="mt-4 space-y-3">
                {communications.map((c) => (
                  <div key={c.id} className="rounded-lg border border-ink-100 p-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${c.direction === 'inbound' ? 'bg-accent-50 text-accent-700' : 'bg-ink-100 text-ink-600'}`}>
                        {c.direction === 'inbound' ? 'FROM' : 'TO'}
                      </span>
                      <p className="truncate text-xs font-semibold text-ink-800">{c.subject}</p>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-500">{c.body}</p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-ink-400">
                      <span>{dateLabel(c.received_at.slice(0, 10))}</span>
                      {c.has_dispute && <span className="text-danger-600 font-medium">Dispute</span>}
                      {c.has_promise && <span className="text-primary-600 font-medium">Promise</span>}
                      <span className="capitalize">{c.sentiment}</span>
                    </div>
                  </div>
                ))}
                {communications.length === 0 && <p className="py-3 text-center text-xs text-ink-400">No communications</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">Clients</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Your commercial memory — every client's contracts, invoices, communications, and payment promises in one place.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{error}</div>
      )}

      {clients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm font-medium text-ink-500">No clients yet</p>
          <p className="mt-1 text-xs text-ink-400">Clients appear here once you have contracts or invoices with them.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => {
            const rs = riskStyles[client.risk_level as RiskLevel] || riskStyles.low;
            const hs = healthStyles[client.relationship_health] || healthStyles.good;
            return (
              <button key={client.id} onClick={() => loadClientDetail(client.name)}
                className="group rounded-2xl border border-ink-200 bg-white p-5 text-left shadow-sm transition-all hover:border-ink-300 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 font-serif text-sm font-semibold text-ink-600">
                      {client.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{client.name}</p>
                      <p className="text-xs text-ink-400">{client.email || 'No email'}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${rs.bg} ${rs.text}`}>{rs.label}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${hs.bg} ${hs.text}`}>{hs.label}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4">
                  <div>
                    <p className="text-[11px] text-ink-400">Outstanding</p>
                    <p className="mt-0.5 font-serif text-lg font-semibold text-ink-900">{currency(Number(client.total_outstanding))}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ink-400">Overdue</p>
                    <p className={`mt-0.5 font-serif text-lg font-semibold ${client.total_overdue > 0 ? 'text-danger-600' : 'text-ink-900'}`}>
                      {currency(Number(client.total_overdue))}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-ink-400">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Avg {client.avg_payment_delay_days}d delay
                  </span>
                  <span className="inline-flex items-center gap-0.5 font-medium text-primary-600 opacity-0 transition group-hover:opacity-100">
                    View <ChevronRight className="h-3 w-3" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
