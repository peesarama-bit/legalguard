import { useState, useEffect, useCallback } from 'react';
import {
  Handshake,
  Loader2,
  Check,
  X,
  Clock,
  AlertTriangle,
  Calendar,
  Sparkles,
} from 'lucide-react';
import type { PaymentPromiseRow } from '@/lib/supabase';
import { fetchPaymentPromises, updatePromiseStatus } from '@/lib/dataAccess';
import { currency, dateLabel } from '@/lib/format';

type FilterKey = 'all' | 'pending' | 'fulfilled' | 'missed';

const filterTabs: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'fulfilled', label: 'Fulfilled' },
  { key: 'missed', label: 'Missed' },
];

const statusConfig: Record<string, { bg: string; text: string; dot: string; icon: typeof Clock; label: string }> = {
  pending: { bg: 'bg-warning-50', text: 'text-warning-700', dot: 'bg-warning-500', icon: Clock, label: 'Pending' },
  fulfilled: { bg: 'bg-primary-50', text: 'text-primary-700', dot: 'bg-primary-500', icon: Check, label: 'Fulfilled' },
  missed: { bg: 'bg-danger-50', text: 'text-danger-700', dot: 'bg-danger-500', icon: AlertTriangle, label: 'Missed' },
};

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export default function Promises() {
  const [promises, setPromises] = useState<PaymentPromiseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPaymentPromises();
      setPromises(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(id: string, status: 'fulfilled' | 'missed' | 'pending') {
    setUpdating(id);
    try {
      await updatePromiseStatus(id, status);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUpdating(null);
    }
  }

  const filtered = filter === 'all' ? promises : promises.filter((p) => p.status === filter);
  const pending = promises.filter((p) => p.status === 'pending');
  const upcoming = pending.filter((p) => daysUntil(p.promised_date) >= 0).sort((a, b) => daysUntil(a.promised_date) - daysUntil(b.promised_date));
  const overdue = pending.filter((p) => daysUntil(p.promised_date) < 0).sort((a, b) => daysUntil(a.promised_date) - daysUntil(b.promised_date));

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
        <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">Payment Promises</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Track every promise a client has made to pay — detected from communications by AI or logged manually.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{error}</div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-warning-600" />
            <p className="text-sm font-medium text-ink-500">Pending</p>
          </div>
          <p className="mt-2 font-serif text-3xl font-semibold text-ink-900">{pending.length}</p>
          <p className="mt-1 text-xs text-ink-400">{overdue.length} past due date</p>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary-600" />
            <p className="text-sm font-medium text-ink-500">Upcoming</p>
          </div>
          <p className="mt-2 font-serif text-3xl font-semibold text-ink-900">{upcoming.length}</p>
          <p className="mt-1 text-xs text-ink-400">
            {upcoming[0] ? `Next: ${dateLabel(upcoming[0].promised_date)}` : 'None scheduled'}
          </p>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-danger-600" />
            <p className="text-sm font-medium text-ink-500">Overdue promises</p>
          </div>
          <p className="mt-2 font-serif text-3xl font-semibold text-danger-600">{overdue.length}</p>
          <p className="mt-1 text-xs text-ink-400">Need firm follow-up</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-xl border border-ink-200 bg-white p-1">
        {filterTabs.map((tab) => {
          const count = tab.key === 'all' ? promises.length : promises.filter((p) => p.status === tab.key).length;
          return (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                filter === tab.key ? 'bg-primary-600 text-white' : 'text-ink-600 hover:bg-ink-50'
              }`}>
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${filter === tab.key ? 'bg-white/20' : 'bg-ink-100 text-ink-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Promises list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-12 text-center">
          <Handshake className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm font-medium text-ink-500">No {filter !== 'all' ? filter : ''} promises</p>
          <p className="mt-1 text-xs text-ink-400">
            Payment promises are detected automatically when you analyze client communications.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const sc = statusConfig[p.status] || statusConfig.pending;
            const StatusIcon = sc.icon;
            const daysLeft = daysUntil(p.promised_date);
            const isPastDue = p.status === 'pending' && daysLeft < 0;

            return (
              <div key={p.id} className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                isPastDue ? 'border-l-4 border-l-danger-400 border-ink-200' : 'border-ink-200'
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink-900">{p.client_name}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${sc.bg} ${sc.text}`}>
                        <StatusIcon className="h-3 w-3" /> {sc.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-400">
                      {p.invoice_number ? `Invoice ${p.invoice_number} · ` : ''}Promised {dateLabel(p.promised_date)}
                    </p>
                    {p.promised_amount > 0 && (
                      <p className="mt-2 font-serif text-xl font-semibold text-ink-900">{currency(Number(p.promised_amount))}</p>
                    )}
                    {p.notes && (
                      <p className="mt-2 text-xs leading-relaxed text-ink-500">{p.notes}</p>
                    )}
                    {p.status === 'pending' && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium">
                        {daysLeft >= 0 ? (
                          <span className="text-warning-600">
                            <Clock className="mr-1 inline h-3.5 w-3.5" />
                            {daysLeft === 0 ? 'Due today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                          </span>
                        ) : (
                          <span className="text-danger-600">
                            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                            {Math.abs(daysLeft)} day{Math.abs(daysLeft) === 1 ? '' : 's'} past promise
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  {p.status === 'pending' && (
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => handleStatusChange(p.id, 'fulfilled')} disabled={updating === p.id}
                        title="Mark as paid"
                        className="rounded-lg border border-primary-200 bg-primary-50 p-2 text-primary-600 transition hover:bg-primary-100 disabled:opacity-50">
                        {updating === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button onClick={() => handleStatusChange(p.id, 'missed')} disabled={updating === p.id}
                        title="Mark as missed"
                        className="rounded-lg border border-danger-200 bg-danger-50 p-2 text-danger-600 transition hover:bg-danger-100 disabled:opacity-50">
                        {updating === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      </button>
                    </div>
                  )}
                  {(p.status === 'fulfilled' || p.status === 'missed') && (
                    <button onClick={() => handleStatusChange(p.id, 'pending')} disabled={updating === p.id}
                      className="shrink-0 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-500 transition hover:bg-ink-50 disabled:opacity-50">
                      {updating === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Reopen'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI hint */}
      <div className="rounded-2xl border border-primary-200 bg-primary-50/50 p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
          <div>
            <p className="text-sm font-semibold text-ink-900">How promises get tracked</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              When you analyze a client communication in the Clients view, the AI automatically detects payment promises,
              extracts the date and amount, and saves them here. Mark promises as fulfilled or missed to keep your
              commercial memory accurate.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
