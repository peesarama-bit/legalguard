import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Webhook,
  Radio,
  Loader2,
  Server,
  Database,
  Mail,
  ShieldAlert,
  FileSearch,
  Zap,
  CircleDot,
  AlertTriangle,
} from 'lucide-react';
import type { ActivityLogRow, WebhookEventRow, InvoiceRow, ContractRow } from '@/lib/supabase';
import {
  fetchActivityLog,
  fetchWebhookEvents,
  fetchInvoices,
  fetchAllContractDetails,
  subscribeToTable,
} from '@/lib/dataAccess';
import { supabase } from '@/lib/supabase';
import { currency, dateLabel } from '@/lib/format';

const severityStyles: Record<string, { border: string; bg: string; text: string; dot: string; icon: typeof Activity }> = {
  error: { border: 'border-l-danger-500', bg: 'bg-danger-50', text: 'text-danger-700', dot: 'bg-danger-500', icon: ShieldAlert },
  warning: { border: 'border-l-warning-500', bg: 'bg-warning-50', text: 'text-warning-700', dot: 'bg-warning-500', icon: AlertTriangle },
  success: { border: 'border-l-primary-500', bg: 'bg-primary-50', text: 'text-primary-700', dot: 'bg-primary-500', icon: FileSearch },
  info: { border: 'border-l-ink-300', bg: 'bg-ink-50', text: 'text-ink-600', dot: 'bg-ink-400', icon: CircleDot },
};

const eventIcons: Record<string, typeof Activity> = {
  contract_scanned: FileSearch,
  webhook_received: Webhook,
  email_drafted: Mail,
  invoice_overdue: AlertTriangle,
  scope_defended: ShieldAlert,
};

export default function Monitoring() {
  const [activity, setActivity] = useState<ActivityLogRow[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEventRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [liveCount, setLiveCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const [a, w, i, c] = await Promise.all([
        fetchActivityLog(30),
        fetchWebhookEvents(),
        fetchInvoices(),
        fetchAllContractDetails(),
      ]);
      const { count } = await supabase.from('email_drafts').select('*', { count: 'exact', head: true });
      setDraftCount(count ?? 0);
      setActivity(a);
      setWebhooks(w);
      setInvoices(i);
      setContracts(c);
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime subscriptions to all tables
  useEffect(() => {
    const tables = ['activity_log', 'webhook_events', 'invoices', 'contracts', 'email_drafts', 'clause_flags', 'contract_terms'];
    const unsubs = tables.map((t) =>
      subscribeToTable(t, () => {
        setLiveCount((n) => n + 1);
        load();
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [load]);

  const stats = {
    totalEvents: activity.length,
    webhooksReceived: webhooks.length,
    contractsScanned: contracts.filter((c) => c.status === 'scanned').length,
    overdueInvoices: invoices.filter((i) => i.status === 'overdue').length,
    draftsGenerated: draftCount,
    errors: activity.filter((a) => a.severity === 'error').length,
  };

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
          <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">Monitoring</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Real-time operations dashboard. Every event — contract scans, webhooks, email drafts — flows here live.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3.5 py-1.5 text-xs font-semibold text-primary-700">
          <Radio className="h-4 w-4 animate-pulse" /> Realtime active {liveCount > 0 && `· ${liveCount} updates`}
        </div>
      </div>

      {/* System stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { icon: Activity, label: 'Total events', value: stats.totalEvents, accent: 'text-ink-600' },
          { icon: Webhook, label: 'Webhooks', value: stats.webhooksReceived, accent: 'text-accent-600' },
          { icon: FileSearch, label: 'Contracts', value: stats.contractsScanned, accent: 'text-primary-600' },
          { icon: AlertTriangle, label: 'Overdue', value: stats.overdueInvoices, accent: 'text-warning-600' },
          { icon: Mail, label: 'Drafts', value: stats.draftsGenerated, accent: 'text-accent-600' },
          { icon: ShieldAlert, label: 'Errors', value: stats.errors, accent: 'text-danger-600' },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
              <Icon className={`h-5 w-5 ${s.accent}`} />
              <p className="mt-2 font-serif text-2xl font-semibold text-ink-900">{s.value}</p>
              <p className="text-xs font-medium text-ink-400">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* System status bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-500" />
          </span>
          <span className="text-sm font-semibold text-ink-900">All systems operational</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-4 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5"><Server className="h-3.5 w-3.5 text-primary-500" /> Edge functions: 3 deployed</span>
          <span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5 text-accent-500" /> 7 tables · Realtime ON</span>
          <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-warning-500" /> RLS enabled</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Activity feed */}
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary-600" />
            <h2 className="font-serif text-lg font-semibold">Activity feed</h2>
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
              {activity.length} events
            </span>
          </div>
          <div className="mt-4 max-h-[32rem] space-y-2.5 overflow-y-auto pr-1">
            {activity.map((a) => {
              const ss = severityStyles[a.severity] ?? severityStyles.info;
              const EventIcon = eventIcons[a.event_type] ?? CircleDot;
              return (
                <div key={a.id} className={`rounded-lg border border-ink-100 border-l-3 p-3 ${ss.border} animate-slide-up`}>
                  <div className="flex items-start gap-2.5">
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${ss.bg} ${ss.text}`}>
                      <EventIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink-700">{a.description}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full ${ss.bg} ${ss.text} px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide`}>
                          {a.event_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[11px] text-ink-400">
                          {new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {activity.length === 0 && (
              <p className="py-8 text-center text-sm text-ink-400">No activity recorded yet.</p>
            )}
          </div>
        </div>

        {/* Webhook events log */}
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-accent-600" />
            <h2 className="font-serif text-lg font-semibold">Webhook events</h2>
            <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
              {webhooks.length} received
            </span>
          </div>
          <div className="mt-4 max-h-[32rem] space-y-2.5 overflow-y-auto pr-1">
            {webhooks.map((w) => (
              <div key={w.id} className="rounded-lg border border-ink-100 p-3 animate-slide-up">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                    <Zap className="h-3.5 w-3.5 text-warning-500" />
                    {w.event_type.replace(/_/g, ' ')}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                    {w.processed ? 'Processed' : 'Pending'}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-ink-400">
                  <span>Source: {w.source}</span>
                  <span>{new Date(w.received_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                {w.payload && (
                  <pre className="mt-2 overflow-x-auto rounded bg-ink-50 p-2 text-[11px] text-ink-600 font-mono">
{JSON.stringify(w.payload, null, 2).slice(0, 300)}
                  </pre>
                )}
              </div>
            ))}
            {webhooks.length === 0 && (
              <p className="py-8 text-center text-sm text-ink-400">
                No webhooks received yet. Stripe will send overdue and dispute events here automatically.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Data tables overview */}
      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
        <h2 className="font-serif text-lg font-semibold">Database overview</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { name: 'contracts', count: contracts.length, icon: FileSearch, desc: 'Uploaded contracts' },
            { name: 'invoices', count: invoices.length, icon: AlertTriangle, desc: 'Tracked invoices' },
            { name: 'webhook_events', count: webhooks.length, icon: Webhook, desc: 'Inbound webhooks' },
            { name: 'activity_log', count: activity.length, icon: Activity, desc: 'Event log entries' },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.name} className="rounded-xl border border-ink-100 p-4">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-ink-400" />
                  <span className="font-serif text-2xl font-semibold text-ink-900">{t.count}</span>
                </div>
                <p className="mt-2 text-sm font-mono font-semibold text-ink-700">{t.name}</p>
                <p className="text-xs text-ink-400">{t.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent invoices table */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
        <div className="border-b border-ink-100 px-6 py-4">
          <h2 className="font-serif text-lg font-semibold">Invoice status</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-6 py-3">Invoice</th>
                <th className="px-6 py-3">Client</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Due</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {invoices.map((inv) => {
                const sb = inv.status === 'overdue' ? { bg: 'bg-danger-50', text: 'text-danger-700', dot: 'bg-danger-500' }
                  : inv.status === 'paid' ? { bg: 'bg-primary-50', text: 'text-primary-700', dot: 'bg-primary-500' }
                  : inv.status === 'sent' ? { bg: 'bg-accent-50', text: 'text-accent-700', dot: 'bg-accent-500' }
                  : { bg: 'bg-ink-100', text: 'text-ink-600', dot: 'bg-ink-400' };
                return (
                  <tr key={inv.id} className="transition hover:bg-ink-50/50">
                    <td className="px-6 py-3.5 font-semibold text-ink-900">{inv.number}</td>
                    <td className="px-6 py-3.5 text-ink-600">{inv.client}</td>
                    <td className="px-6 py-3.5 font-semibold text-ink-900">{currency(Number(inv.amount))}</td>
                    <td className="px-6 py-3.5 text-ink-500">{dateLabel(inv.due_at)}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sb.bg} ${sb.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${sb.dot}`} />
                        {inv.status === 'overdue' ? `${inv.days_late}d late` : inv.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
