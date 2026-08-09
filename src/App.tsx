import { useState } from 'react';
import {
  LayoutDashboard,
  FileSearch,
  Receipt,
  ShieldAlert,
  Sparkles,
  Scale,
  Activity,
  Settings,
  LogOut,
  Loader2,
  Users,
  Handshake,
  MessageCircle,
} from 'lucide-react';
import { AuthProvider, useAuth } from '@/lib/auth';
import Dashboard from '@/views/Dashboard';
import ContractScanner from '@/views/ContractScanner';
import Invoices from '@/views/Invoices';
import ScopeDefender from '@/views/ScopeDefender';
import Monitoring from '@/views/Monitoring';
import Clients from '@/views/Clients';
import Promises from '@/views/Promises';
import AskAI from '@/views/AskAI';
import Account from '@/views/Account';
import Auth from '@/views/Auth';

export type ViewKey =
  | 'dashboard'
  | 'contracts'
  | 'invoices'
  | 'scope'
  | 'monitoring'
  | 'clients'
  | 'promises'
  | 'askai'
  | 'account';

const navItems: { key: ViewKey; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { key: 'monitoring', label: 'Monitoring', icon: Activity, group: 'Overview' },
  { key: 'askai', label: 'Ask My Business', icon: MessageCircle, group: 'Overview' },
  { key: 'clients', label: 'Clients', icon: Users, group: 'Relationships' },
  { key: 'promises', label: 'Payment Promises', icon: Handshake, group: 'Relationships' },
  { key: 'contracts', label: 'Contract Scanner', icon: FileSearch, group: 'Audit' },
  { key: 'invoices', label: 'Invoices & Follow-up', icon: Receipt, group: 'Enforce' },
  { key: 'scope', label: 'Scope Creep Defender', icon: ShieldAlert, group: 'Enforce' },
];

function AppContent() {
  const { user, profile, loading, signOut } = useAuth();
  const [view, setView] = useState<ViewKey>('dashboard');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  const initials = (profile?.display_name || user.email || '?')
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('');

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900">
      <div className="flex">
        {/* Sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-ink-200 bg-white lg:flex">
          <div className="flex items-center gap-2.5 px-6 py-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
              <Scale className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div>
              <p className="font-serif text-lg font-semibold leading-none text-ink-900">LegalGuard</p>
              <p className="mt-0.5 text-[11px] font-medium text-ink-400">AI Commercial Agent</p>
            </div>
          </div>

          <nav className="mt-2 flex-1 overflow-y-auto px-3">
            {navItems.map((item, i) => {
              const Icon = item.icon;
              const active = view === item.key;
              const prevGroup = i > 0 ? navItems[i - 1].group : '';
              const showGroup = item.group !== prevGroup;
              return (
                <div key={item.key}>
                  {showGroup && (
                    <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                      {item.group}
                    </p>
                  )}
                  <button
                    onClick={() => setView(item.key)}
                    className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                      active ? 'bg-primary-50 text-primary-800' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                    }`}
                  >
                    <Icon
                      className={`h-[18px] w-[18px] transition-colors ${
                        active ? 'text-primary-600' : 'text-ink-400 group-hover:text-ink-600'
                      }`}
                      strokeWidth={2}
                    />
                    {item.label}
                  </button>
                </div>
              );
            })}

            {/* Account section */}
            <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Account</p>
            <button
              onClick={() => setView('account')}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                view === 'account' ? 'bg-primary-50 text-primary-800' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
              }`}
            >
              <Settings
                className={`h-[18px] w-[18px] transition-colors ${
                  view === 'account' ? 'text-primary-600' : 'text-ink-400 group-hover:text-ink-600'
                }`}
                strokeWidth={2}
              />
              Account settings
            </button>
          </nav>

          {/* User card + disclaimer */}
          <div className="px-3 pb-4">
            <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-ink-200 bg-ink-50 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 font-serif text-sm font-semibold text-primary-700">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{profile?.display_name || 'Your name'}</p>
                <p className="truncate text-xs text-ink-400">{user.email}</p>
              </div>
              <button
                onClick={() => signOut()}
                title="Sign out"
                className="shrink-0 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-ink-900 to-ink-800 p-3.5 text-white">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary-300" />
                <p className="text-xs font-semibold">AI Disclaimer</p>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-300">
                LegalGuard is not legal advice. Always consult a licensed attorney for binding contracts.
              </p>
            </div>
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex w-full items-center justify-between border-b border-ink-200 bg-white px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
              <Scale className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <span className="font-serif text-base font-semibold">LegalGuard</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={view}
              onChange={(e) => setView(e.target.value as ViewKey)}
              className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs font-medium text-ink-700"
            >
              {navItems.map((n) => (
                <option key={n.key} value={n.key}>{n.label}</option>
              ))}
              <option value="account">Account</option>
            </select>
            <button
              onClick={() => signOut()}
              className="rounded-lg border border-ink-200 p-1.5 text-ink-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Main content */}
        <main className="min-h-screen flex-1 lg:pl-64">
          <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
            {view === 'dashboard' && <Dashboard onNavigate={setView} />}
            {view === 'monitoring' && <Monitoring />}
            {view === 'askai' && <AskAI />}
            {view === 'clients' && <Clients />}
            {view === 'promises' && <Promises />}
            {view === 'contracts' && <ContractScanner onNavigate={setView} />}
            {view === 'invoices' && <Invoices />}
            {view === 'scope' && <ScopeDefender />}
            {view === 'account' && <Account />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
