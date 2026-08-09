import { useState } from 'react';
import { Scale, Mail, Lock, User, Building2, Loader2, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password);
        if (error) setError(error);
      } else {
        const { error } = await signUp(email, password, displayName, company);
        if (error) setError(error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-50 via-ink-50 to-primary-50/30 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-lg shadow-primary-600/20">
            <Scale className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <h1 className="mt-4 font-serif text-2xl font-semibold text-ink-900">LegalGuard</h1>
          <p className="mt-1 text-sm text-ink-500">Your AI commercial relationship agent</p>
        </div>

        <div className="rounded-2xl border border-ink-200 bg-white p-7 shadow-sm">
          {/* Toggle */}
          <div className="mb-6 flex gap-1 rounded-xl bg-ink-100 p-1">
            <button
              onClick={() => { setMode('signup'); setError(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                mode === 'signup' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              Create account
            </button>
            <button
              onClick={() => { setMode('signin'); setError(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                mode === 'signin' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              Sign in
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Name</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                    <input
                      type="text" required value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Alex Morgan"
                      className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-3 text-sm text-ink-900 outline-none transition focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Company <span className="font-normal text-ink-300">(optional)</span></label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                    <input
                      type="text" value={company} onChange={(e) => setCompany(e.target.value)}
                      placeholder="Morgan Studio"
                      className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-3 text-sm text-ink-900 outline-none transition focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-3 text-sm text-ink-900 outline-none transition focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                  minLength={6}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-3 text-sm text-ink-900 outline-none transition focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700">
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-primary-300"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> {mode === 'signup' ? 'Creating account…' : 'Signing in…'}</>
              ) : (
                <>{mode === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>

          {mode === 'signup' && (
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-primary-50/60 p-3">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-600" />
              <p className="text-xs leading-relaxed text-ink-600">
                Start with a clean workspace — upload your first contract to begin AI analysis. No credit card needed.
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-ink-400">
          By continuing you agree to LegalGuard's terms. This is not legal advice.
        </p>
      </div>
    </div>
  );
}
