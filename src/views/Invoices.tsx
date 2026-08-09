import { useState, useEffect, useCallback } from 'react';
import {
  Receipt,
  Loader2,
  Sparkles,
  Copy,
  Check,
  Mail,
  Clock,
  Webhook,
  FileText,
  Send,
  Radio,
  AlertTriangle,
} from 'lucide-react';
import type { InvoiceRow, ContractWithDetails } from '@/lib/supabase';
import { fetchInvoices, fetchAllContractDetails, subscribeToTable } from '@/lib/dataAccess';
import { draftEmail } from '@/lib/api';
import { currency, dateLabel, statusBadge } from '@/lib/format';

export default function Invoices() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [contracts, setContracts] = useState<ContractWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tone, setTone] = useState<'friendly' | 'professional' | 'firm' | 'final'>('professional');
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<{ subject: string; body: string; draftId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveUpdates, setLiveUpdates] = useState(0);

  const load = useCallback(async () => {
    try {
      const [inv, con] = await Promise.all([fetchInvoices(), fetchAllContractDetails()]);
      setInvoices(inv);
      setContracts(con);
      if (!selectedId && inv.length > 0) setSelectedId(inv[0].id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription to invoice changes
  useEffect(() => {
    const unsub = subscribeToTable<InvoiceRow>('invoices', () => {
      setLiveUpdates((n) => n + 1);
      load();
    });
    return unsub;
  }, [load]);

  const selected = invoices.find((i) => i.id === selectedId) ?? null;
  const contract = selected ? contracts.find((c) => c.id === selected.contract_id) : null;
  const isOverdue = selected?.status === 'overdue';

  async function draftFollowUp() {
    if (!selected) return;
    setDrafting(true);
    setError(null);
    try {
      const result = await draftEmail(selected.id, tone);
      setDraft({ subject: result.subject, body: result.body, draftId: result.draft_id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  function copyDraft() {
    if (draft) {
      navigator.clipboard.writeText(draft.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function selectInvoice(id: string) {
    setSelectedId(id);
    setDraft(null);
  }

  const toneOptions = [
    { key: 'friendly' as const, label: 'Friendly reminder', description: 'Warm, low-pressure nudge' },
    { key: 'professional' as const, label: 'Professional', description: 'Polite but clear about terms' },
    { key: 'firm' as const, label: 'Firm follow-up', description: 'Direct, references obligations' },
    { key: 'final' as const, label: 'Final notice', description: 'Escalation, last step before collections' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">Invoices & Follow-up</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Track invoices and trigger the AI to draft a context-aware follow-up that cites your signed contract terms.
          </p>
        </div>
        {liveUpdates > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
            <Radio className="h-3.5 w-3.5 animate-pulse" /> Live · {liveUpdates} update{liveUpdates > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{error}</div>
      )}

      {/* Invoice list */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
        <div className="border-b border-ink-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink-700">All invoices ({invoices.length})</h2>
        </div>
        <div className="divide-y divide-ink-100">
          {invoices.map((inv) => {
            const sb = statusBadge(inv.status);
            const active = inv.id === selectedId;
            return (
              <button key={inv.id} onClick={() => selectInvoice(inv.id)}
                className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition ${
                  active ? 'bg-primary-50/50' : 'hover:bg-ink-50'
                }`}>
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-primary-100 text-primary-700' : 'bg-ink-100 text-ink-500'}`}>
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">{inv.number}</p>
                    <p className="mt-0.5 text-xs text-ink-400">{inv.client} · due {dateLabel(inv.due_at)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-ink-900">{currency(Number(inv.amount))}</p>
                  <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${sb.bg} ${sb.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${sb.dot}`} />
                    {inv.status === 'overdue' ? `${inv.days_late}d late` : sb.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: invoice detail + webhook */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-ink-400">Invoice</p>
                  <h2 className="mt-1 font-serif text-2xl font-semibold text-ink-900">{selected.number}</h2>
                  <p className="mt-1 text-sm text-ink-500">{selected.client}</p>
                </div>
                <div className="text-right">
                  <p className="font-serif text-3xl font-semibold text-ink-900">{currency(Number(selected.amount))}</p>
                  {isOverdue && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-danger-50 px-2.5 py-0.5 text-xs font-semibold text-danger-700">
                      <Clock className="h-3 w-3" /> {selected.days_late} days late
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-ink-50 p-3">
                  <p className="text-xs text-ink-400">Issued</p>
                  <p className="mt-0.5 font-semibold text-ink-800">{dateLabel(selected.issued_at)}</p>
                </div>
                <div className="rounded-lg bg-ink-50 p-3">
                  <p className="text-xs text-ink-400">Due</p>
                  <p className="mt-0.5 font-semibold text-ink-800">{dateLabel(selected.due_at)}</p>
                </div>
              </div>

              {contract && (
                <div className="mt-4 rounded-lg border border-accent-100 bg-accent-50/50 p-3.5">
                  <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent-700">
                    <FileText className="h-3 w-3" /> Linked contract
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink-900">{contract.title}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {contract.terms.find((t) => t.label === 'Net terms')?.value ?? '—'} ·{' '}
                    {contract.terms.find((t) => t.label === 'Late fee')?.value ?? '—'}
                  </p>
                </div>
              )}
            </div>

            {/* Invoice status */}
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Webhook className="h-5 w-5 text-ink-600" />
                <h3 className="text-sm font-semibold text-ink-900">Payment status</h3>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
                Stripe webhooks automatically mark invoices overdue when payments fail or disputes are opened. No manual action needed.
              </p>

              <div className={`mt-4 flex items-start gap-2 rounded-lg p-3 ${isOverdue ? 'bg-danger-50' : 'bg-primary-50/60'}`}>
                {isOverdue ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" />
                ) : (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                )}
                <p className="text-xs leading-relaxed text-ink-700">
                  {isOverdue ? (
                    <>
                      <span className="font-semibold">Overdue:</span> {selected.days_late} days past due. Ready to draft a follow-up email citing your contract terms.
                    </>
                  ) : (
                    <span className="font-semibold">This invoice is not overdue. Follow-up emails are available for overdue invoices.</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Right: email drafter */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary-600" />
                <h3 className="text-sm font-semibold text-ink-900">Contextual email drafter</h3>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
                Calls the AI edge function which reads the linked contract terms from the database and generates a follow-up citing them. Saved automatically.
              </p>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Tone</p>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  {toneOptions.map((opt) => {
                    const active = tone === opt.key;
                    return (
                      <button key={opt.key} onClick={() => setTone(opt.key)} disabled={!isOverdue}
                        className={`rounded-lg border px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                          active ? 'border-primary-400 bg-primary-50 shadow-sm' : 'border-ink-200 hover:border-ink-300'
                        }`}>
                        <p className={`text-xs font-semibold ${active ? 'text-primary-800' : 'text-ink-800'}`}>{opt.label}</p>
                        <p className="mt-0.5 text-[11px] text-ink-400">{opt.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button onClick={draftFollowUp} disabled={!isOverdue || drafting}
                className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                  !isOverdue ? 'cursor-not-allowed bg-ink-100 text-ink-400'
                  : drafting ? 'bg-primary-400 text-white'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}>
                {drafting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Drafting with AI…</>)
                : (<><Mail className="h-4 w-4" /> Draft follow-up email</>)}
              </button>
            </div>

            {(drafting || draft) && (
              <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm animate-slide-up">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-ink-600" />
                    <h3 className="text-sm font-semibold text-ink-900">Draft email</h3>
                  </div>
                  {draft && (
                    <button onClick={copyDraft}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-600 transition hover:bg-ink-50">
                      {copied ? <Check className="h-3.5 w-3.5 text-primary-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>

                {drafting ? (
                  <div className="mt-4 space-y-2.5">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-3 rounded shimmer-bg" style={{ width: `${90 - i * 8}%` }} />
                    ))}
                  </div>
                ) : draft ? (
                  <div className="mt-4">
                    <div className="rounded-lg bg-ink-50 p-3">
                      <p className="text-xs text-ink-400">Subject</p>
                      <p className="mt-0.5 text-sm font-semibold text-ink-900">{draft.subject}</p>
                    </div>
                    <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink-700 font-sans">
{draft.body}
                    </pre>
                    <div className="mt-4 flex items-center gap-2 border-t border-ink-100 pt-4">
                      <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-primary-700">
                        <Send className="h-3.5 w-3.5" /> Send email
                      </button>
                      <button onClick={draftFollowUp}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3.5 py-2 text-xs font-semibold text-ink-700 transition hover:bg-ink-50">
                        <Sparkles className="h-3.5 w-3.5" /> Regenerate
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
