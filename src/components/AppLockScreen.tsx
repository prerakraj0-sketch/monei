import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';

interface AppLockScreenProps {
  onUnlocked: (token: string) => void;
}

export function AppLockScreen({ onUnlocked }: AppLockScreenProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMessage('Please enter the password to open the app.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.token) {
        setErrorMessage(data.error || 'Incorrect password. Please try again.');
        setIsSubmitting(false);
        return;
      }

      onUnlocked(data.token);
    } catch {
      setErrorMessage('Unable to verify password right now. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
        <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display">
          Meridian Ledger
        </span>
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
          Protected Access
        </span>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-12 lg:py-20 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-slate-900">
                <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                  <LockKeyhole className="w-5 h-5 text-slate-900" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-display">
                    Unlock Meridian Ledger
                  </h1>
                  <p className="text-sm text-slate-500">
                    Enter your application password to open the workspace.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="app-access-password"
                    className="block text-xs font-medium text-slate-700"
                  >
                    App Password
                  </label>
                  <div className="relative">
                    <input
                      id="app-access-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      autoFocus
                      autoComplete="current-password"
                      placeholder="Enter password"
                      disabled={isSubmitting}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-900 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {errorMessage && (
                  <p
                    role="alert"
                    className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                  >
                    {errorMessage}
                  </p>
                )}

                <div className="pt-1 flex items-center justify-between gap-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <span>{isSubmitting ? 'Checking...' : 'Open App'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-500">
                    Session stays unlocked until closed or locked
                  </span>
                </div>
              </form>
            </div>
          </section>

          <aside className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 font-display">
                Inside this workspace
              </h2>
              <div className="divide-y divide-slate-100 text-sm">
                <div className="py-3 first:pt-0">
                  <div className="font-medium text-slate-900">Real-Time Stock Portfolio</div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Live NSE/BSE valuations powered by Groww market feeds and INR conversion.
                  </p>
                </div>
                <div className="py-3">
                  <div className="font-medium text-slate-900">Money on Hand &amp; Monthly Spend</div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Liquid balances, recurring bills, and monthly budget tracking.
                  </p>
                </div>
                <div className="py-3">
                  <div className="font-medium text-slate-900">Important Deals &amp; Agreements</div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Deal pipeline, signed money agreements, 2x default clauses, PDF &amp; Excel exports.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 text-xs text-slate-500">
              Lock the ledger anytime from the workspace toolbar when stepping away.
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
