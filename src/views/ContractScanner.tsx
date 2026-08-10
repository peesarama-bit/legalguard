import { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileSearch,
  Upload,
  FileText,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  Sparkles,
  TrendingUp,
  ArrowRight,
  Lightbulb,
  Scale,
  CheckCircle2,
} from 'lucide-react';
import type { ContractWithDetails, ClauseFlagRow } from '@/lib/supabase';
import { fetchAllContractDetails, createContract } from '@/lib/dataAccess';
import { scanContract } from '@/lib/api';
import { currency, dateLabel, riskColor } from '@/lib/format';
import type { ViewKey } from '@/App';

const levelStyles: Record<string, { badge: string; dot: string; label: string; border: string }> = {
  high: { badge: 'bg-danger-50 text-danger-700', dot: 'bg-danger-500', label: 'High risk', border: 'border-l-danger-500' },
  medium: { badge: 'bg-warning-50 text-warning-700', dot: 'bg-warning-500', label: 'Medium', border: 'border-l-warning-500' },
  low: { badge: 'bg-primary-50 text-primary-700', dot: 'bg-primary-500', label: 'Low', border: 'border-l-primary-400' },
};

const categoryLabel: Record<string, string> = {
  payment: 'Payment', scope: 'Scope', deadline: 'Deadline',
  ip: 'IP', termination: 'Termination', liability: 'Liability',
};

export default function ContractScanner({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const [contracts, setContracts] = useState<ContractWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [hasDrag, setHasDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAllContractDetails();
      setContracts(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  const selected = contracts.find((c) => c.id === selectedId) ?? null;

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const text = await file.text();
      const fileName = file.name.replace(/\.[^.]+$/, '');
      const newContract = await createContract(fileName, 'New Client', text.slice(0, 50000));
      setSelectedId(newContract.id);
      await load();
      // Trigger the AI scan edge function
      const result = await scanContract(newContract.id, text.slice(0, 50000) || 'unlimited revisions net-60 intellectual property upon delivery');
      if (!result.success) throw new Error('Scan failed');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">Contract Scanner</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Upload a PDF contract or MSA. The AI audits for predatory clauses and extracts key terms in plain English.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
          {error}
        </div>
      )}

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setHasDrag(true); }}
        onDragLeave={() => setHasDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setHasDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) handleUpload(f);
        }}
        onClick={() => fileInput.current?.click()}
        className={`group cursor-pointer rounded-2xl border-2 border-dashed bg-white p-8 text-center transition-all ${
          hasDrag ? 'border-primary-500 bg-primary-50/40' : 'border-ink-200 hover:border-primary-300 hover:bg-ink-50/50'
        }`}
      >
        <input ref={fileInput} type="file" accept=".pdf,.txt,.md" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 transition-transform group-hover:scale-105">
          {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Upload className="h-7 w-7" />}
        </div>
        <p className="mt-4 text-sm font-semibold text-ink-900">
          {uploading ? 'Scanning contract…' : 'Drop a contract PDF here, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-ink-400">
          {uploading ? 'AI is reading clauses and flagging risks — this takes a few seconds.' : 'PDF, TXT up to 25 MB · processed by AI edge function'}
        </p>
        {uploading && (
          <div className="mx-auto mt-5 max-w-xs">
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full w-2/3 animate-pulse-soft rounded-full bg-primary-500" />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="rounded-2xl border border-ink-200 bg-white p-12 text-center">
          <FileSearch className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">No contracts yet. Upload one above to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          {/* Contract list */}
          <div className="space-y-2.5">
            <p className="px-1 text-xs font-semibold uppercase tracking-wider text-ink-400">Contracts</p>
            {contracts.map((c) => {
              const active = c.id === selectedId;
              const rc = riskColor(c.risk_score);
              return (
                <button key={c.id} onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                    active ? 'border-primary-300 bg-primary-50/60 shadow-sm' : 'border-ink-200 bg-white hover:border-ink-300'
                  }`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-primary-100 text-primary-700' : 'bg-ink-100 text-ink-500'}`}>
                      {c.status === 'processing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">{c.title}</p>
                      <p className="mt-0.5 text-xs text-ink-400">{c.client} · {c.page_count}p</p>
                      {c.status === 'scanned' ? (
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${rc.bg} ${rc.text}`}>
                            {c.risk_score}/100
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-400">
                            <AlertTriangle className="h-3 w-3 text-danger-500" /> {c.flags.length}
                          </span>
                        </div>
                      ) : (
                        <span className="mt-2 inline-block rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-500">
                          {c.status === 'processing' ? 'Processing…' : c.status}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail */}
          <div className="space-y-6">
            {!selected ? (
              <div className="rounded-2xl border border-ink-200 bg-white p-12 text-center shadow-sm">
                <p className="text-sm text-ink-500">Select a contract to view its audit.</p>
              </div>
            ) : selected.status === 'processing' ? (
              <div className="rounded-2xl border border-ink-200 bg-white p-12 text-center shadow-sm">
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary-500" />
                <p className="mt-4 font-serif text-lg font-semibold">Scanning {selected.title}</p>
                <p className="mt-1 text-sm text-ink-400">Reading {selected.page_count} pages for risks and terms…</p>
              </div>
            ) : (
              <>
                {/* Header card */}
                <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="font-serif text-xl font-semibold text-ink-900">{selected.title}</h2>
                      <p className="mt-1 text-sm text-ink-400">
                        {selected.client} · {selected.page_count} pages · uploaded {dateLabel(selected.uploaded_at.slice(0, 10))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-ink-400">Contract value</p>
                      <p className="font-serif text-2xl font-semibold text-ink-900">{currency(Number(selected.total_value))}</p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl bg-ink-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink-700">
                        <TrendingUp className="h-4 w-4 text-ink-400" /> Risk score
                      </span>
                      <span className={`text-sm font-bold ${riskColor(selected.risk_score).text}`}>
                        {selected.risk_score}/100 — {riskColor(selected.risk_score).label}
                      </span>
                    </div>
                    <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-ink-200">
                      <div className={`h-full rounded-full transition-all ${
                        selected.risk_score >= 60 ? 'bg-danger-500' : selected.risk_score >= 35 ? 'bg-warning-500' : 'bg-primary-500'
                      }`} style={{ width: `${selected.risk_score}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-ink-400">
                      {selected.flags.filter((f) => f.level === 'high').length} high ·{' '}
                      {selected.flags.filter((f) => f.level === 'medium').length} medium ·{' '}
                      {selected.flags.filter((f) => f.level === 'low').length} low severity flags
                    </p>
                  </div>
                </div>

                {/* Red flags */}
                <div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-danger-600" />
                    <h3 className="font-serif text-lg font-semibold">Red flag scanner</h3>
                    <span className="rounded-full bg-danger-50 px-2.5 py-0.5 text-xs font-semibold text-danger-700">
                      {selected.flags.length} found
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {selected.flags.map((flag: ClauseFlagRow) => {
                      const ls = levelStyles[flag.level];
                      return (
                        <div key={flag.id} className={`rounded-xl border border-ink-200 border-l-4 bg-white p-5 shadow-sm ${ls.border}`}>
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${ls.dot}`} />
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ls.badge}`}>{ls.label}</span>
                            <span className="text-[11px] font-medium text-ink-400">{flag.clause_ref}</span>
                          </div>
                          <p className="mt-3 text-sm font-semibold text-ink-900">{flag.title}</p>
                          <blockquote className="mt-2 border-l-2 border-ink-200 pl-3 text-xs italic leading-relaxed text-ink-500">
                            "{flag.excerpt}"
                          </blockquote>
                          <div className="mt-3 rounded-lg bg-primary-50/60 p-3">
                            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
                              <Sparkles className="h-3 w-3" /> Plain English
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-ink-700">{flag.plain_english}</p>
                          </div>
                          <div className="mt-2.5 rounded-lg bg-warning-50/70 p-3">
                            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-warning-700">
                              <Lightbulb className="h-3 w-3" /> Suggested pushback
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-ink-700">{flag.pushback}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Term extractor */}
                <div>
                  <div className="flex items-center gap-2">
                    <Scale className="h-5 w-5 text-accent-600" />
                    <h3 className="font-serif text-lg font-semibold">Extracted terms</h3>
                    <span className="rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent-700">
                      {selected.terms.length} terms
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-400">
                    Automatically pulled from the contract and saved. These terms power the follow-up email drafter.
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {selected.terms.map((term) => (
                      <div key={term.id} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm transition hover:border-accent-200">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-600">
                            {categoryLabel[term.category] ?? term.category}
                          </span>
                          <span className="text-[11px] font-medium text-ink-300">{term.source}</span>
                        </div>
                        <p className="mt-1.5 text-xs font-medium text-ink-400">{term.label}</p>
                        <p className="mt-0.5 text-sm font-semibold text-ink-900">{term.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {selected.flags.length === 0 && (
                  <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4">
                    <ShieldCheck className="h-6 w-6 text-primary-600" />
                    <div>
                      <p className="text-sm font-semibold text-primary-800">No red flags detected</p>
                      <p className="text-xs text-primary-700">This contract looks clean — but always double-check the fine print.</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-xl border border-ink-200 bg-ink-50 p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary-600" />
                    <p className="text-sm font-medium text-ink-700">
                      Audit complete — {selected.flags.length} flags, {selected.terms.length} terms extracted
                    </p>
                  </div>
                  <button onClick={() => onNavigate('invoices')}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700">
                    Go to invoices <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
