import { useState } from 'react';
import { supabase, supabaseConfigured } from '@/lib/supabase/client';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [mode, setMode] = useState<'guest' | 'email'>('guest');

  const guest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInAnonymously({ options: { data: { display_name: guestName.trim().slice(0, 24) } } });
    setBusy(false);
    if (error) setError(error.message);
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div className="safe-top mx-auto flex min-h-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 flex flex-col items-center">
        <div className="mb-5 flex gap-1">
          {['♠', '♥', '♦', '♣'].map((s, i) => (
            <span key={s} className={`card-face flex h-12 w-9 items-center justify-center rounded-md text-xl font-bold ${i % 2 ? 'text-red-600' : 'text-gray-900'}`} style={{ transform: `rotate(${(i - 1.5) * 8}deg) translateY(${Math.abs(i - 1.5) * 3}px)` }}>
              {s}
            </span>
          ))}
        </div>
        <Logo size="lg" />
        <p className="mt-3 text-center text-sm text-white/60">Shanghai rummy and Swoop with friends, on your phone.</p>
      </div>

      {!supabaseConfigured && (
        <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/15 p-3 text-sm">
          Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
        </div>
      )}

      <div className="panel p-1.5">
        <div className="mb-3 grid grid-cols-2 rounded-xl bg-ink-3 p-1 text-sm font-semibold">
          <button className={`rounded-lg py-2 transition ${mode === 'guest' ? 'bg-ink-4 text-gold shadow' : 'text-white/60'}`} onClick={() => setMode('guest')}>
            Play as guest
          </button>
          <button className={`rounded-lg py-2 transition ${mode === 'email' ? 'bg-ink-4 text-gold shadow' : 'text-white/60'}`} onClick={() => setMode('email')}>
            Magic link
          </button>
        </div>
        <div className="px-3 pb-3">
          {mode === 'guest' ? (
            <form onSubmit={guest} className="flex flex-col gap-3">
              <label className="label" htmlFor="guest">Your name at the table</label>
              <input id="guest" value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={24} className="input" placeholder="e.g. Sean" autoComplete="nickname" />
              <Button type="submit" size="lg" disabled={busy || !guestName.trim()}>
                Enter the room
              </Button>
              <p className="text-xs text-white/45">No email needed. Your seat is remembered on this device.</p>
            </form>
          ) : sent ? (
            <div className="flex flex-col gap-2 py-2">
              <p className="font-semibold">Check your email</p>
              <p className="text-sm text-white/60">We sent a magic link to {email}. Open it on this device to sign in.</p>
              <Button variant="ghost" size="sm" onClick={() => setSent(false)}>Use a different email</Button>
            </div>
          ) : (
            <form onSubmit={send} className="flex flex-col gap-3">
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" />
              <Button type="submit" size="lg" disabled={busy || !email}>
                {busy ? 'Sending…' : 'Send magic link'}
              </Button>
              <p className="text-xs text-white/45">Sign in with email to keep your saved rule sets across devices.</p>
            </form>
          )}
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        </div>
      </div>
    </div>
  );
}
