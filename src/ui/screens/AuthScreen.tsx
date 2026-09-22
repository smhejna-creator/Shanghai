import { useState } from 'react';
import { supabase, supabaseConfigured } from '@/lib/supabase/client';
import { Button } from '../components/Button';

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guestName, setGuestName] = useState('');

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
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="mb-1 text-4xl font-black tracking-tight text-amber-300">Shanghai</h1>
      <p className="mb-8 text-white/70">Contract rummy with friends, on your phone.</p>
      {!supabaseConfigured && (
        <div className="mb-4 rounded-lg bg-red-500/20 p-3 text-sm">
          Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
        </div>
      )}
      <form onSubmit={guest} className="mb-6 flex flex-col gap-3 rounded-2xl bg-white/10 p-4">
        <p className="font-semibold">Play as a guest</p>
        <input
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          maxLength={24}
          className="rounded-xl bg-white px-4 py-3 text-black"
          placeholder="Your name"
          autoComplete="nickname"
        />
        <Button type="submit" size="lg" disabled={busy || !guestName.trim()}>
          Continue as guest
        </Button>
        <p className="text-xs text-white/60">No email needed. Your seat is remembered on this device; use email if you want to switch devices.</p>
      </form>
      <p className="mb-2 text-sm text-white/70">Or sign in with a magic link</p>
      {sent ? (
        <div className="rounded-xl bg-white/10 p-4">
          <p className="font-semibold">Check your email</p>
          <p className="text-sm text-white/70">We sent a magic link to {email}. Open it on this device to sign in.</p>
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => setSent(false)}>
            Use a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={send} className="flex flex-col gap-3">
          <label className="text-sm text-white/70" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl bg-white px-4 py-3 text-black"
            placeholder="you@example.com"
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          <Button type="submit" variant="secondary" disabled={busy || !email} size="lg">
            {busy ? 'Sending…' : 'Send magic link'}
          </Button>
        </form>
      )}
    </div>
  );
}
