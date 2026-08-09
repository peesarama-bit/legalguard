import { useState, useEffect } from 'react';
import { User, Building2, Mail, Save, Loader as Loader2, Check, LogOut, Scale, Calendar, Key, Cpu, Webhook, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { dateLabel } from '@/lib/format';
import { fetchWorkspaceSettings, upsertWorkspaceSettings } from '@/lib/dataAccess';

export default function Account() {
  const { user, profile, updateProfile, signOut } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Workspace settings state
  const [nimKey, setNimKey] = useState('');
  const [nimModel, setNimModel] = useState('nvidia/nemotron-3-nano-30b-a3b');
  const [nimBaseUrl, setNimBaseUrl] = useState('https://integrate.api.nvidia.com/v1');
  const [stripeSecret, setStripeSecret] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showStripeSecret, setShowStripeSecret] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setCompany(profile.company || '');
    }
  }, [profile]);

  useEffect(() => {
    fetchWorkspaceSettings()
      .then((s) => {
        if (s) {
          setNimKey(s.nim_api_key || '');
          setNimModel(s.nim_model || 'nvidia/nemotron-3-nano-30b-a3b');
          setNimBaseUrl(s.nim_base_url || 'https://integrate.api.nvidia.com/v1');
          setStripeSecret(s.stripe_webhook_secret || '');
        }
      })
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, []);

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

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSaved(false);
    try {
      await upsertWorkspaceSettings({
        nim_api_key: nimKey,
        nim_model: nimModel,
        nim_base_url: nimBaseUrl,
        stripe_webhook_secret: stripeSecret,
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to save settings');
    }
    setSettingsSaving(false);
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
        <p className="mt-1.5 text-sm text-ink-500">Manage your profile, integrations, and session.</p>
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

      {/* AI & Integrations Settings */}
      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary-600" />
          <h2 className="font-serif text-lg font-semibold">AI & Integrations</h2>
        </div>
        <p className="mt-1 text-sm text-ink-500">
          Configure your NVIDIA NIM API key to power contract scanning, email drafting, and client analysis.
          If left blank, the system uses the default server-side key.
        </p>

        {settingsLoading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-ink-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
          </div>
        ) : (
          <form onSubmit={handleSaveSettings} className="mt-6 space-y-5">
            {/* NVIDIA NIM API Key */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
                NVIDIA NIM API Key
              </label>
              <div className="relative">
                <Key className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  type={showKey ? 'text' : 'password'}
                  value={nimKey}
                  onChange={(e) => setNimKey(e.target.value)}
                  placeholder="nvapi-…"
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-10 text-sm text-ink-900 outline-none transition focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-400">
                Get a key from{' '}
                <a href="https://build.nvidia.com" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                  build.nvidia.com
                </a>
              </p>
            </div>

            {/* Model */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
                Model
              </label>
              <div className="relative">
                <Cpu className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  type="text"
                  value={nimModel}
                  onChange={(e) => setNimModel(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-3 text-sm text-ink-900 outline-none transition focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <p className="mt-1 text-xs text-ink-400">Default: nvidia/nemotron-3-nano-30b-a3b</p>
            </div>

            {/* Base URL */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
                API Base URL
              </label>
              <input
                type="text"
                value={nimBaseUrl}
                onChange={(e) => setNimBaseUrl(e.target.value)}
                className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 px-3 text-sm text-ink-900 outline-none transition focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
              />
              <p className="mt-1 text-xs text-ink-400">Default: https://integrate.api.nvidia.com/v1</p>
            </div>

            <div className="border-t border-ink-100 pt-5" />

            {/* Stripe Webhook Secret */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
                Stripe Webhook Secret
              </label>
              <div className="relative">
                <Webhook className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  type={showStripeSecret ? 'text' : 'password'}
                  value={stripeSecret}
                  onChange={(e) => setStripeSecret(e.target.value)}
                  placeholder="whsec_…"
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-10 text-sm text-ink-900 outline-none transition focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
                />
                <button
                  type="button"
                  onClick={() => setShowStripeSecret(!showStripeSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                >
                  {showStripeSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-400">Used to verify incoming Stripe webhook events.</p>
            </div>

            {settingsError && (
              <div className="rounded-lg border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700">
                {settingsError}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit" disabled={settingsSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:bg-primary-300"
              >
                {settingsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : settingsSaved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {settingsSaving ? 'Saving…' : settingsSaved ? 'Saved' : 'Save settings'}
              </button>
            </div>
          </form>
        )}
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
