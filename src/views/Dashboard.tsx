import { useState, useEffect, useCallback } from 'react';
import {
  FileSearch,
  Receipt,
  ShieldAlert,
  TrendingUp,
  AlertTriangle,
  Clock,
  ArrowRight,
  Sparkles,
  Radio,
  Activity,
  Users,
  Handshake,
  MessageCircle,
} from 'lucide-react';
import type { ContractWithDetails, InvoiceRow, ActivityLogRow, ClientRow, PaymentPromiseRow } from '@/lib/supabase';
import { fetchAllContractDetails, fetchInvoices, fetchActivityLog, fetchClients, fetchPaymentPromises, subscribeToTable } from '@/lib/dataAccess';
import { currency, dateLabel, riskColor, statusBadge } from '@/lib/format';
import type { ViewKey } from '@/App';

function Stat({ icon: Icon, label, value, sub, accent }: {
  icon: typeof FileSearch; label: string; value: string; sub: string; accent: string;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-ink-500">{label}</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-ink-900">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-ink-400">{sub}</p>
    </div>
  );
}

export default function Dashboard({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const [contracts, setContracts] = useState<ContractWithDetails[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [activity, setActivity] = useState<ActivityLogRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [promises, setPromises] = useState<PaymentPromiseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveCount, setLiveCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const [c, i, a, cl, p] = await Promise.all([fetchAllContractDetails(), fetchInvoices(), fetchActivityLog(5), fetchClients(), fetchPaymentPromises()]);
      setContracts(c);
      setInvoices(i);
      setActivity(a);
      setClients(cl);
      setPromises(p);
    } catch {
      // swallow on dashboard
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh on any table change
  useEffect(() => {
    const tables = ['contracts', 'invoices', 'activity_log', 'webhook_events', 'email_drafts', 'clients', 'payment_promises', 'ai_insights', 'client_communications'];
    const unsubs = tables.map((t) =>
      subscribeToTable(t, () => {
        setLiveCount((n) => n + 1);
        load();
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [load]);

  const scanned = contracts.filter((c) => c.status === 'scanned');
  const totalFlags = scanned.reduce((n, c) => n + c.flags.length, 0);
  const highFlags = scanned.reduce((n, c) => n + c.flags.filter((f) => f.level === 'high').length, 0);
  const overdue = invoices.filter((i) => i.status === 'overdue');
  const overdueTotal = overdue.reduce((s, i) => s + Number(i.amount), 0);
  const avgRisk = scanned.length ? Math.round(scanned.reduce((s, c) => s + c.risk_score, 0) / scanned.length) : 0;
  const rc = riskColor(avgRisk);
  const highRiskClients = clients.filter((c) => c.risk_level === 'high');
  const pendingPromises = promises.filter((p) => p.status === 'pending');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      {/* Hero */}
      <div className="overflow-hidden rounded-3xl border border-ink-200 bg-gradient-to-br from-ink-900 via-ink-800 to-primary-900 p-8 text-white sm:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-primary-200 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> AI co-pilot {liveCount > 0 && (
                <span className="inline-flex items-center gap-1 text-primary-300">
                  · <Radio className="h-3 w-3 animate-pulse" /> live
                </span>
              )}
            </div>
            <h1 className="mt-4 font-serif text-3xl font-semibold leading-tight sm:text-4xl">
              Your AI commercial relationship agent.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-300">
              LegalGuard understands your contracts, invoices, and client communications — then tells you why
              payments are delayed and what to do next. Ask questions, track promises, and act with confidence.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => onNavigate('askai')}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-900/30 transition hover:bg-primary-400">
              <Sparkles className="h-4 w-4" /> Ask My Business
            </button>
            <button onClick={() => onNavigate('clients')}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10">
              <Users className="h-4 w-4" /> View clients
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label="Clients tracked" value={String(clients.length)}
          sub={`${highRiskClients.length} high risk · ${currency(clients.reduce((s, c) => s + Number(c.total_overdue), 0))} overdue`}
          accent="bg-accent-50 text-accent-600" />
        <Stat icon={AlertTriangle} label="Red flags found" value={String(totalFlags)}
          sub={`${highFlags} high severity · needs pushback`} accent="bg-danger-50 text-danger-600" />
        <Stat icon={Handshake} label="Payment promises" value={String(pendingPromises.length)}
          sub={`${promises.filter((p) => p.status === 'missed').length} missed · needs follow-up`} accent="bg-warning-50 text-warning-600" />
        <Stat icon={TrendingUp} label="Avg. contract risk" value={`${avgRisk}/100`} sub={rc.label}
          accent="bg-primary-50 text-primary-600" />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Client overview */}
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold">Client overview</h2>
            <button onClick={() => onNavigate('clients')}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {clients.slice(0, 4).map((c) => {
              const rs = c.risk_level === 'high' ? { bg: 'bg-danger-50', text: 'text-danger-700' } : c.risk_level === 'medium' ? { bg: 'bg-warning-50', text: 'text-warning-700' } : { bg: 'bg-primary-50', text: 'text-primary-700' };
              return (
                <div key={c.id} onClick={() => onNavigate('clients')}
                  className="cursor-pointer rounded-xl border border-ink-100 p-4 transition hover:border-ink-200 hover:bg-ink-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">{c.name}</p>
                      <p className="mt-0.5 text-xs text-ink-400">
                        {currency(Number(c.total_outstanding))} outstanding · {c.avg_payment_delay_days}d avg delay
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${rs.bg} ${rs.text}`}>
                      {c.risk_level}
                    </span>
                  </div>
                  {c.total_overdue > 0 && (
                    <div className="mt-2.5 flex items-center gap-3 text-[11px] font-medium text-ink-400">
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-danger-500" /> {currency(Number(c.total_overdue))} overdue
                      </span>
                      <span className="capitalize">Health: {c.relationship_health.replace('_', ' ')}</span>
                    </div>
                  )}
                </div>
              );
            })}
            {clients.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-400">No clients yet.</p>
            )}
          </div>
        </div>

        {/* Needs follow-up + live activity */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold">Needs follow-up</h2>
              <button onClick={() => onNavigate('invoices')}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700">
                Chase now <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {overdue.slice(0, 3).map((inv) => {
                const sb = statusBadge(inv.status);
                return (
                  <div key={inv.id} onClick={() => onNavigate('invoices')}
                    className="cursor-pointer rounded-xl border border-ink-100 p-4 transition hover:border-ink-200 hover:bg-ink-50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-900">{inv.number}</p>
                        <p className="mt-0.5 text-xs text-ink-400">{inv.client} · due {dateLabel(inv.due_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-ink-900">{currency(Number(inv.amount))}</p>
                        <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${sb.bg} ${sb.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sb.dot}`} />
                          {inv.days_late}d late
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {overdue.length === 0 && (
                <p className="py-6 text-center text-sm text-ink-400">No overdue invoices. All clear.</p>
              )}
            </div>
          </div>

          {/* Live activity feed */}
          <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary-600" />
              <h2 className="font-serif text-lg font-semibold">Live activity</h2>
              {liveCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                  <Radio className="h-3 w-3 animate-pulse" /> {liveCount} new
                </span>
              )}
            </div>
            <div className="mt-4 space-y-2.5">
              {activity.map((a) => {
                const color = a.severity === 'error' ? 'border-l-danger-500' : a.severity === 'warning' ? 'border-l-warning-500' : a.severity === 'success' ? 'border-l-primary-500' : 'border-l-ink-300';
                return (
                  <div key={a.id} className={`rounded-lg border border-ink-100 border-l-3 p-3 ${color}`}>
                    <p className="text-xs font-medium text-ink-700">{a.description}</p>
                    <p className="mt-0.5 text-[11px] text-ink-400">
                      {new Date(a.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                );
              })}
              {activity.length === 0 && (
                <p className="py-4 text-center text-sm text-ink-400">No activity yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <button onClick={() => onNavigate('askai')} className="group rounded-2xl border border-ink-200 bg-gradient-to-br from-primary-50 to-white p-5 text-left shadow-sm transition hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white">
            <MessageCircle className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-ink-900">Ask My Business</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">Ask anything about your contracts, invoices, clients, and payments. The AI has full context.</p>
        </button>
        <button onClick={() => onNavigate('clients')} className="group rounded-2xl border border-ink-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-100 text-accent-700">
            <Users className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-ink-900">Client Memory</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">See every client's contracts, communications, payment promises, and risk level in one place.</p>
        </button>
        <button onClick={() => onNavigate('promises')} className="group rounded-2xl border border-ink-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning-100 text-warning-700">
            <Handshake className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-ink-900">Payment Promises</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">Track every promise a client has made. AI detects them from communications automatically.</p>
        </button>
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
        <h2 className="font-serif text-lg font-semibold">How LegalGuard works</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { icon: FileSearch, title: '1. Understand contracts', text: 'AI scans your contracts for predatory clauses, extracts key terms, and flags risks in plain English.' },
            { icon: Users, title: '2. Track relationships', text: 'Every client communication, payment promise, and dispute is tracked — building a complete commercial memory.' },
            { icon: Receipt, title: '3. Act with confidence', text: 'When payments stall, the AI tells you why and what to do — then drafts the right email citing your actual terms.' },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="rounded-xl border border-ink-100 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <p className="mt-3 text-sm font-semibold text-ink-900">{s.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">{s.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
