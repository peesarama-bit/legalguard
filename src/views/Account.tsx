import { useState, useEffect } from 'react';
import { User, Building2, Mail, Save, Loader2, Check, LogOut, Scale, Calendar } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { dateLabel } from '@/lib/format';

export default function Account() {
  const { user, profile, updateProfile, signOut } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setCompany(profile.company || '');
    }
  }, [profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error } = await updateProfile({ display_name: displayName, company });
    if (error) {
      setError(error);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  if (!user) return null;

  const initials = (displayName || user.email || '?')
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('');

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">Account</h1>
        <p className="mt-1.5 text-sm text-ink-500">Manage your profile and session.</p>
      </div>

      {/* Profile card */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
        {/* Header banner */}
        <div className="h-24 bg-gradient-to-r from-primary-600 to-accent-600" />

        <div className="px-6 pb-6">
          {/* Avatar + name */}
          <div className="-mt-10 flex items-end gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-primary-100 font-serif text-2xl font-semibold text-primary-700 shadow-sm">
              {initials}
            </div>
            <div className="pb-2">
              <p className="font-serif text-xl font-semibold text-ink-900">{displayName || 'Your name'}</p>
              <p className="text-sm text-ink-400">{company || 'No company set'}</p>
            </div>
          </div>

          {/* Edit form */}
          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Display name</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-3 text-sm text-ink-900 outline-none transition focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Company</label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  type="text" value={company} onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-3 text-sm text-ink-900 outline-none transition focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit" disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:bg-primary-300"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Account info */}
      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
        <h2 className="font-serif text-lg font-semibold">Account details</h2>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-3">
            <span className="inline-flex items-center gap-2 text-sm text-ink-500">
              <Mail className="h-4 w-4 text-ink-400" /> Email
            </span>
            <span className="text-sm font-semibold text-ink-900">{user.email}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-3">
            <span className="inline-flex items-center gap-2 text-sm text-ink-500">
              <Calendar className="h-4 w-4 text-ink-400" /> Member since
            </span>
            <span className="text-sm font-semibold text-ink-900">
              {dateLabel(user.created_at.slice(0, 10))}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-3">
            <span className="inline-flex items-center gap-2 text-sm text-ink-500">
              <Scale className="h-4 w-4 text-ink-400" /> User ID
            </span>
            <span className="font-mono text-xs text-ink-600">{user.id.slice(0, 8)}…{user.id.slice(-4)}</span>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
        <h2 className="font-serif text-lg font-semibold">Session</h2>
        <p className="mt-1 text-sm text-ink-500">Sign out of your account on this device.</p>
        <button
          onClick={() => signOut()}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-danger-200 bg-danger-50 px-4 py-2.5 text-sm font-semibold text-danger-700 transition hover:bg-danger-100"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
