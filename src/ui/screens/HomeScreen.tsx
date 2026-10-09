import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { GAMES, type GameType } from '@/engine/index.ts';
import { api } from '@/lib/supabase/api';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';

export function HomeScreen({ user, signOut }: { user: User; signOut: () => void }) {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [games, setGames] = useState<Awaited<ReturnType<typeof api.myGames>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.profile(user.id).then((n) => setName(n || user.email?.split('@')[0] || 'Player'));
    api.myGames().then(setGames).catch(() => {});
  }, [user.id, user.email]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.setDisplayName(user.id, name.trim().slice(0, 24) || 'Player');
      const r = await api.joinGame(code, name);
      nav(`/g/${r.gameId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="safe-top mx-auto flex min-h-full max-w-md flex-col gap-5 px-5 py-6 lg:max-w-4xl lg:py-10">
      <header className="flex items-center justify-between">
        <Logo size="md" className="!items-start" />
        <div className="flex items-center gap-2">
          {user.is_anonymous && <span className="rounded-full border border-line bg-ink-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">Guest</span>}
          <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel flex flex-col gap-3 p-5">
          <div>
            <div className="font-display text-xl font-bold">Open a table</div>
            <p className="text-sm text-white/55">Pick a game and its house rules, invite friends or add bots, and deal.</p>
          </div>
          <label className="label">Your name at the table</label>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => api.setDisplayName(user.id, name.trim().slice(0, 24) || 'Player')} maxLength={24} className="input" />
          <div className="grid gap-2">
            {(Object.keys(GAMES) as GameType[]).map((g) => (
              <button key={g} onClick={() => nav(`/new/${g}`)} className="group flex items-center justify-between rounded-xl border border-line bg-ink-3 px-4 py-3 text-left transition hover:border-gold/50 hover:bg-ink-4">
                <span>
                  <span className="font-display text-lg font-bold text-white group-hover:text-gold">{g === 'shanghai' ? '♠ ' : '♦ '}{GAMES[g].title}</span>
                  <span className="block text-xs text-white/55">{GAMES[g].tagline}</span>
                </span>
                <span className="ml-3 text-gold">→</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel flex flex-col gap-3 p-5">
          <div>
            <div className="font-display text-xl font-bold">Join with a code</div>
            <p className="text-sm text-white/55">Got an invite? Enter the 6-character code.</p>
          </div>
          <form onSubmit={join} className="flex flex-col gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              autoCapitalize="characters"
              className="input text-center font-mono text-2xl font-bold uppercase tracking-[0.4em]"
            />
            <Button type="submit" size="lg" variant="outline" disabled={busy || code.length < 4}>Take a seat</Button>
          </form>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </section>
      </div>

      {games.length > 0 && (
        <section>
          <h2 className="label mb-2">Your tables</h2>
          <ul className="grid gap-2 lg:grid-cols-2">
            {games.map((g) => (
              <li key={g.id}>
                <Link to={`/g/${g.id}`} className="panel flex items-center justify-between px-4 py-3 hover:border-gold/40">
                  <span>
                    <span className="font-mono text-base font-bold tracking-[0.25em] text-gold">{g.join_code}</span>
                    <span className="ml-3 text-sm text-white/80">{GAMES[g.game_type]?.title ?? 'Shanghai'}</span>
                    <span className="ml-2 text-sm text-white/50">{g.ruleset_name}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${g.status === 'playing' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/60'}`}>{g.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link to="/rulesets" className="text-center text-sm text-white/50 underline-offset-4 hover:text-gold hover:underline">My saved rule sets</Link>
    </div>
  );
}
