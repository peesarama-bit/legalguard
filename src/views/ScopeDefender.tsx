import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Sparkles,
  Loader2,
  Copy,
  Check,
  FileText,
  Send,
  MessageSquare,
} from 'lucide-react';
import type { ContractWithDetails } from '@/lib/supabase';
import { fetchAllContractDetails } from '@/lib/dataAccess';
import { defendScope } from '@/lib/api';

export default function ScopeDefender() {
  const [contracts, setContracts] = useState<ContractWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [contractId, setContractId] = useState<string | null>(null);
  const [requestText, setRequestText] = useState('');
  const [defending, setDefending] = useState(false);
  const [reply, setReply] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAllContractDetails();
      const scanned = data.filter((c) => c.status === 'scanned');
      setContracts(scanned);
      if (!contractId && scanned.length > 0) setContractId(scanned[0].id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => { load(); }, [load]);

  const contract = contracts.find((c) => c.id === contractId);
  const revisionTerm = contract?.terms.find((t) => t.label === 'Revision rounds');

  async function defend() {
    if (!contractId) return;
    setDefending(true);
    setReply('');
    setError(null);
    try {
      const result = await defendScope(contractId, requestText);
      setReply(result.reply);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDefending(false);
    }
  }

  function copyReply() {
    navigator.clipboard.writeText(reply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-7 w-7 text-primary-600" />
          <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">Scope Creep Defender</h1>
        </div>
        <p className="mt-1.5 text-sm text-ink-500">
          Paste a client's email asking for "just one more quick change." The AI edge function drafts a reply referencing your contract's revision limits.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Input */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Reference contract</p>
            <div className="mt-2.5 space-y-2">
              {contracts.map((c) => {
                const active = c.id === contractId;
                return (
                  <button key={c.id} onClick={() => setContractId(c.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                      active ? 'border-primary-300 bg-primary-50/50' : 'border-ink-200 hover:border-ink-300'
                    }`}>
                    <FileText className={`h-5 w-5 shrink-0 ${active ? 'text-primary-600' : 'text-ink-400'}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">{c.title}</p>
                      <p className="mt-0.5 text-xs text-ink-400">
                        Revisions: {c.terms.find((t) => t.label === 'Revision rounds')?.value ?? '—'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
              <MessageSquare className="h-3.5 w-3.5" /> Client's email
            </p>
            <textarea value={requestText} onChange={(e) => setRequestText(e.target.value)} rows={12}
              className="mt-2.5 w-full resize-none rounded-xl border border-ink-200 bg-ink-50/50 p-3.5 text-sm leading-relaxed text-ink-800 outline-none transition focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
              placeholder="Paste the client's email here…" />
            <button onClick={defend} disabled={defending || !requestText.trim() || !contractId}
              className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                defending || !requestText.trim() ? 'cursor-not-allowed bg-primary-300 text-white'
                : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}>
              {defending ? (<><Loader2 className="h-4 w-4 animate-spin" /> Analyzing scope via edge function…</>)
              : (<><ShieldAlert className="h-4 w-4" /> Defend scope</>)}
            </button>
          </div>
        </div>

        {/* Output */}
        <div className="space-y-4">
          {revisionTerm && (
            <div className="rounded-2xl border border-accent-100 bg-accent-50/40 p-5">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent-700">
                <Sparkles className="h-3 w-3" /> Contract context (from database)
              </p>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-500">Revision limit</span>
                  <span className="font-semibold text-ink-900">{revisionTerm.value}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-500">Scope clause</span>
                  <span className="font-semibold text-ink-900">
                    {contract?.flags.find((f) => f.title === 'Vague scope definition') ? 'Broad / undefined' : 'Defined'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                <Sparkles className="h-3.5 w-3.5 text-primary-500" /> Suggested reply
              </p>
              {reply && (
                <button onClick={copyReply}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-600 transition hover:bg-ink-50">
                  {copied ? <Check className="h-3.5 w-3.5 text-primary-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>

            {defending ? (
              <div className="mt-4 space-y-2.5">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="h-3 rounded shimmer-bg" style={{ width: `${88 - i * 6}%` }} />
                ))}
              </div>
            ) : reply ? (
              <>
                <pre className="mt-4 max-h-[28rem] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink-700 font-sans">
{reply}
                </pre>
                <div className="mt-4 flex items-center gap-2 border-t border-ink-100 pt-4">
                  <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-primary-700">
                    <Send className="h-3.5 w-3.5" /> Send reply
                  </button>
                  <button onClick={defend}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3.5 py-2 text-xs font-semibold text-ink-700 transition hover:bg-ink-50">
                    <Sparkles className="h-3.5 w-3.5" /> Regenerate
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-8 mb-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-ink-400">
                  Paste the client's email and hit "Defend scope" to generate a reply.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
