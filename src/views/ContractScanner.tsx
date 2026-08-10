import { useState, useRef, useEffect, useCallback } from 'react';
import { FileSearch, Upload, FileText, TriangleAlert as AlertTriangle, ShieldCheck, Loader as Loader2, Sparkles, TrendingUp, ArrowRight, Lightbulb, Scale, CircleCheck as CheckCircle2, Stethoscope, ChevronDown, ChevronUp, Circle as XCircle } from 'lucide-react';
import type { ContractWithDetails, ClauseFlagRow } from '@/lib/supabase';
import { fetchAllContractDetails, createContract, updateContractExtraction, insertContractPages, deleteContractPages, fetchContractPages } from '@/lib/dataAccess';
import { scanContract } from '@/lib/api';
import { currency, dateLabel, riskColor } from '@/lib/format';
import { extractPdfText, chunkDocument, getDiagnostics, type ExtractionDiagnostics } from '@/lib/pdfExtract';
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

type ProcessingStage = 'idle' | 'reading' | 'extracting' | 'ocr' | 'analyzing' | 'complete' | 'failed';

interface ProcessingState {
  stage: ProcessingStage;
  currentPage: number;
  totalPages: number;
  nativePages: number;
  ocrPages: number;
  failedPages: number[];
  totalChars: number;
  totalWords: number;
  chunkCount: number;
  error: string | null;
  diagnostics: ExtractionDiagnostics | null;
}

const initialProcessing: ProcessingState = {
  stage: 'idle',
  currentPage: 0,
  totalPages: 0,
  nativePages: 0,
  ocrPages: 0,
  failedPages: [],
  totalChars: 0,
  totalWords: 0,
  chunkCount: 0,
  error: null,
  diagnostics: null,
};

const stageLabels: Record<ProcessingStage, string> = {
  idle: '',
  reading: 'Reading PDF…',
  extracting: 'Extracting text',
  ocr: 'OCR processing',
  analyzing: 'AI analyzing contract',
  complete: 'Analysis complete',
  failed: 'Processing failed',
};

export default function ContractScanner({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const [contracts, setContracts] = useState<ContractWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState<ProcessingState>(initialProcessing);
  const [hasDrag, setHasDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [pageData, setPageData] = useState<{ page_number: number; extraction_method: string; char_count: number; word_count: number }[]>([]);
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

  async function loadPageData(contractId: string) {
    try {
      const pages = await fetchContractPages(contractId);
      setPageData(pages.map((p: any) => ({
        page_number: p.page_number,
        extraction_method: p.extraction_method,
        char_count: p.char_count,
        word_count: p.word_count,
      })));
    } catch {
      setPageData([]);
    }
  }

  useEffect(() => {
    if (selectedId && selected?.status === 'scanned') {
      loadPageData(selectedId);
    } else {
      setPageData([]);
    }
  }, [selectedId, selected?.status]);

  async function handleUpload(file: File) {
    setProcessing({ ...initialProcessing, stage: 'reading', totalPages: 0 });
    setError(null);
    const fileName = file.name.replace(/\.[^.]+$/, '');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    try {
      let fullText = '';
      let pageCount = 1;
      let extractionResult = null;
      let chunks: { chunkId: number; pageStart: number; pageEnd: number; text: string }[] = [];

      if (isPdf) {
        // PDF pipeline: extract per-page text with OCR fallback
        setProcessing((p) => ({ ...p, stage: 'extracting' }));
        extractionResult = await extractPdfText(file, (stage, currentPage, totalPages) => {
          setProcessing((p) => ({
            ...p,
            stage: stage === 'ocr' ? 'ocr' : 'extracting',
            currentPage,
            totalPages,
          }));
        });

        fullText = extractionResult.fullText;
        pageCount = extractionResult.pageCount;

        setProcessing((p) => ({
          ...p,
          stage: 'analyzing',
          totalPages: pageCount,
          nativePages: extractionResult.nativeTextPages,
          ocrPages: extractionResult.ocrPages,
          failedPages: extractionResult.failedPages,
          totalChars: extractionResult.totalChars,
          totalWords: extractionResult.totalWords,
        }));

        // Chunk the document
        chunks = chunkDocument(extractionResult.pageTexts);
        setProcessing((p) => ({ ...p, chunkCount: chunks.length }));

        if (fullText.trim().length === 0) {
          throw new Error('No text could be extracted from this PDF. The document may be corrupted or contain only images that OCR could not process.');
        }
      } else {
        // Text file: read directly
        fullText = await file.text();
        chunks = [{ chunkId: 0, pageStart: 1, pageEnd: 1, text: fullText.slice(0, 50000) }];
        pageCount = 1;
        setProcessing((p) => ({
          ...p,
          stage: 'analyzing',
          totalPages: 1,
          nativePages: 1,
          totalChars: fullText.length,
          totalWords: fullText.trim().split(/\s+/).filter(Boolean).length,
          chunkCount: 1,
        }));
      }

      // Create contract record with real page count
      const newContract = await createContract(fileName, 'New Client', fullText.slice(0, 100000), pageCount, file.size, file.type);
      setSelectedId(newContract.id);

      // Store per-page extraction data
      if (extractionResult) {
        await deleteContractPages(newContract.id);
        await insertContractPages(newContract.id, extractionResult.pages.map((p) => ({
          page_number: p.pageNumber,
          text: p.text.slice(0, 50000),
          extraction_method: p.extractionMethod,
          ocr_confidence: p.ocrConfidence,
          char_count: p.charCount,
          word_count: p.wordCount,
        })));

        // Update contract with extraction metadata
        await updateContractExtraction(newContract.id, {
          page_count: pageCount,
          raw_text: fullText.slice(0, 100000),
          extraction_status: 'completed',
          extraction_method: extractionResult.ocrPages > 0 ? 'mixed' : 'native',
          native_text_pages: extractionResult.nativeTextPages,
          ocr_pages: extractionResult.ocrPages,
          total_extracted_chars: extractionResult.totalChars,
          total_words: extractionResult.totalWords,
          chunk_count: chunks.length,
          extraction_duration_ms: Math.round(extractionResult.extractionDurationMs),
          ocr_duration_ms: Math.round(extractionResult.ocrDurationMs),
          extraction_confidence: extractionResult.overallConfidence,
          failed_pages: extractionResult.failedPages.join(','),
        });
      }

      await load();

      // Trigger AI scan edge function with chunks
      setProcessing((p) => ({ ...p, stage: 'analyzing' }));
      const result = await scanContract(newContract.id, chunks, pageCount);

      if (!result.success) throw new Error('AI scan failed');

      // Build diagnostics
      const diagnostics = extractionResult
        ? getDiagnostics(file, extractionResult, chunks.length)
        : null;
      if (diagnostics && result.diagnostics) {
        diagnostics.chunkCount = result.diagnostics.chunkCount;
      }

      setProcessing((p) => ({
        ...p,
        stage: 'complete',
        diagnostics,
      }));

      await load();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setProcessing((p) => ({ ...p, stage: 'failed', error: msg }));
    }
  }

  const isProcessing = processing.stage !== 'idle' && processing.stage !== 'complete' && processing.stage !== 'failed';

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
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
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
        onClick={() => !isProcessing && fileInput.current?.click()}
        className={`group relative cursor-pointer rounded-2xl border-2 border-dashed bg-white p-8 text-center transition-all ${
          isProcessing ? 'cursor-wait border-primary-300 bg-primary-50/30' :
          hasDrag ? 'border-primary-500 bg-primary-50/40' : 'border-ink-200 hover:border-primary-300 hover:bg-ink-50/50'
        }`}
      >
        <input ref={fileInput} type="file" accept=".pdf,.txt,.md" className="hidden" disabled={isProcessing}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />

        {isProcessing ? (
          <div className="space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">{stageLabels[processing.stage]}</p>
              {processing.totalPages > 0 && (
                <p className="mt-1 text-xs text-ink-400">
                  {processing.stage === 'ocr'
                    ? `OCR processing page ${processing.currentPage} of ${processing.totalPages}`
                    : processing.stage === 'extracting'
                    ? `Extracting page ${processing.currentPage} of ${processing.totalPages}`
                    : processing.stage === 'analyzing'
                    ? `Analyzing ${processing.totalPages} pages across ${processing.chunkCount} chunks`
                    : `Processing ${processing.totalPages} pages…`}
                </p>
              )}
            </div>
            {processing.totalPages > 0 && (
              <div className="mx-auto max-w-xs">
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-primary-500 transition-all duration-300"
                    style={{ width: `${processing.totalPages > 0 ? (processing.currentPage / processing.totalPages) * 100 : 0}%` }}
                  />
                </div>
                {processing.nativePages > 0 && (
                  <p className="mt-2 text-[11px] text-ink-400">
                    {processing.nativePages} pages extracted · {processing.ocrPages} OCR · {processing.failedPages.length} failed
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 transition-transform group-hover:scale-105">
              <Upload className="h-7 w-7" />
            </div>
            <p className="mt-4 text-sm font-semibold text-ink-900">
              Drop a contract PDF here, or click to browse
            </p>
            <p className="mt-1 text-xs text-ink-400">
              PDF, TXT up to 25 MB · per-page extraction with OCR fallback · AI-powered analysis
            </p>
          </>
        )}
      </div>

      {processing.stage === 'complete' && processing.diagnostics && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary-600" />
            <p className="text-sm font-semibold text-primary-800">
              Processing complete: {processing.diagnostics.pageCount} pages · {processing.diagnostics.nativeTextPages} native · {processing.diagnostics.ocrPages} OCR · {processing.diagnostics.chunkCount} chunks
            </p>
          </div>
        </div>
      )}

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
                          {c.status === 'processing' ? 'Processing…' : c.status === 'failed' ? 'Failed' : c.status}
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
            ) : selected.status === 'failed' ? (
              <div className="rounded-2xl border border-danger-200 bg-danger-50 p-8 text-center shadow-sm">
                <XCircle className="mx-auto h-10 w-10 text-danger-500" />
                <p className="mt-3 font-serif text-lg font-semibold text-danger-800">Analysis failed</p>
                <p className="mt-1 text-sm text-danger-600">{selected.processing_error || 'Unknown error during processing.'}</p>
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
                      {selected.contract_type && (
                        <p className="mt-0.5 text-xs font-medium text-ink-400">{selected.contract_type}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-ink-400">Contract value</p>
                      <p className="font-serif text-2xl font-semibold text-ink-900">
                        {currency(Number(selected.total_value))}
                      </p>
                      {selected.currency && selected.currency !== 'USD' && (
                        <p className="text-xs text-ink-400">{selected.currency}</p>
                      )}
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

                {/* Diagnostics panel */}
                {(selected.native_text_pages > 0 || selected.ocr_pages > 0 || selected.chunk_count > 0) && (
                  <div className="rounded-2xl border border-ink-200 bg-white shadow-sm">
                    <button
                      onClick={() => setShowDiagnostics(!showDiagnostics)}
                      className="flex w-full items-center justify-between p-5"
                    >
                      <div className="flex items-center gap-2">
                        <Stethoscope className="h-5 w-5 text-accent-600" />
                        <h3 className="font-serif text-lg font-semibold">Document diagnostics</h3>
                      </div>
                      {showDiagnostics ? <ChevronUp className="h-5 w-5 text-ink-400" /> : <ChevronDown className="h-5 w-5 text-ink-400" />}
                    </button>
                    {showDiagnostics && (
                      <div className="border-t border-ink-100 p-5">
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                          <DiagItem label="File size" value={formatBytes(selected.file_size)} />
                          <DiagItem label="PDF pages" value={String(selected.page_count)} />
                          <DiagItem label="Native text pages" value={String(selected.native_text_pages)} />
                          <DiagItem label="OCR pages" value={String(selected.ocr_pages)} />
                          <DiagItem label="Failed pages" value={selected.failed_pages || 'None'} />
                          <DiagItem label="Total characters" value={selected.total_extracted_chars.toLocaleString()} />
                          <DiagItem label="Total words" value={selected.total_words.toLocaleString()} />
                          <DiagItem label="Chunks" value={String(selected.chunk_count)} />
                          <DiagItem label="Extraction time" value={formatDuration(selected.extraction_duration_ms)} />
                          <DiagItem label="OCR time" value={formatDuration(selected.ocr_duration_ms)} />
                          <DiagItem label="AI analysis time" value={formatDuration(selected.ai_duration_ms)} />
                          <DiagItem label="Confidence" value={`${Math.round(selected.extraction_confidence * 100)}%`} />
                        </div>
                        {pageData.length > 0 && (
                          <div className="mt-5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-2">Per-page extraction</p>
                            <div className="max-h-48 overflow-y-auto rounded-lg border border-ink-100">
                              <table className="w-full text-xs">
                                <thead className="bg-ink-50 text-left text-ink-400">
                                  <tr>
                                    <th className="px-3 py-2">Page</th>
                                    <th className="px-3 py-2">Method</th>
                                    <th className="px-3 py-2">Chars</th>
                                    <th className="px-3 py-2">Words</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-100">
                                  {pageData.map((p, i) => (
                                    <tr key={i} className={p.extraction_method === 'failed' ? 'bg-danger-50/50' : ''}>
                                      <td className="px-3 py-1.5 font-medium text-ink-700">{p.page_number}</td>
                                      <td className="px-3 py-1.5">
                                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                          p.extraction_method === 'native' ? 'bg-primary-50 text-primary-700' :
                                          p.extraction_method === 'ocr' ? 'bg-accent-50 text-accent-700' :
                                          'bg-danger-50 text-danger-700'
                                        }`}>
                                          {p.extraction_method}
                                        </span>
                                      </td>
                                      <td className="px-3 py-1.5 text-ink-600">{p.char_count.toLocaleString()}</td>
                                      <td className="px-3 py-1.5 text-ink-600">{p.word_count.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
                      const ls = levelStyles[flag.level] || levelStyles.low;
                      return (
                        <div key={flag.id} className={`rounded-xl border border-ink-200 border-l-4 bg-white p-5 shadow-sm ${ls.border}`}>
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${ls.dot}`} />
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ls.badge}`}>{ls.label}</span>
                            <span className="text-[11px] font-medium text-ink-400">{flag.clause_ref}</span>
                            {flag.source_page && (
                              <span className="ml-auto rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-500">
                                Page {flag.source_page}
                              </span>
                            )}
                          </div>
                          <p className="mt-3 text-sm font-semibold text-ink-900">{flag.title}</p>
                          {flag.excerpt && (
                            <blockquote className="mt-2 border-l-2 border-ink-200 pl-3 text-xs italic leading-relaxed text-ink-500">
                              "{flag.excerpt}"
                            </blockquote>
                          )}
                          {flag.plain_english && (
                            <div className="mt-3 rounded-lg bg-primary-50/60 p-3">
                              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
                                <Sparkles className="h-3 w-3" /> Plain English
                              </p>
                              <p className="mt-1 text-sm leading-relaxed text-ink-700">{flag.plain_english}</p>
                            </div>
                          )}
                          {flag.pushback && (
                            <div className="mt-2.5 rounded-lg bg-warning-50/70 p-3">
                              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-warning-700">
                                <Lightbulb className="h-3 w-3" /> Suggested pushback
                              </p>
                              <p className="mt-1 text-sm leading-relaxed text-ink-700">{flag.pushback}</p>
                            </div>
                          )}
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
                          <div className="flex items-center gap-1.5">
                            {term.source_page && (
                              <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
                                Page {term.source_page}
                              </span>
                            )}
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                              term.status === 'found' ? 'bg-primary-50 text-primary-700' :
                              term.status === 'not_found' ? 'bg-ink-100 text-ink-500' :
                              'bg-danger-50 text-danger-700'
                            }`}>
                              {term.status === 'found' ? 'Found' : term.status === 'not_found' ? 'Not found' : term.status}
                            </span>
                          </div>
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

function DiagItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-100 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(ms: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
