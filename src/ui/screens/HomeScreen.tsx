import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { api } from '@/lib/supabase/api';
import { Button } from '../components/Button';

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
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-5 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-amber-300">
          Shang Hi{user.is_anonymous && <span className="ml-2 align-middle rounded bg-white/15 px-2 text-xs font-semibold text-white/80">guest</span>}
        </h1>
        <Button variant="ghost" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </header>

      <section className="rounded-2xl bg-white/10 p-4">
        <label className="text-sm text-white/70">Your name at the table</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => api.setDisplayName(user.id, name.trim().slice(0, 24) || 'Player')}
          maxLength={24}
          className="mt-1 w-full rounded-xl bg-white px-4 py-3 text-black"
        />
      </section>

      <section className="grid gap-3">
        <Button size="lg" onClick={() => nav('/new')}>
          Create a game
        </Button>
        <form onSubmit={join} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="JOIN CODE"
            maxLength={6}
            autoCapitalize="characters"
            className="min-w-0 flex-1 rounded-xl bg-white px-4 py-3 font-mono text-lg uppercase tracking-widest text-black"
          />
          <Button type="submit" variant="secondary" disabled={busy || code.length < 4}>
            Join
          </Button>
        </form>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </section>

      {games.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm uppercase tracking-wide text-white/60">Your games</h2>
          <ul className="grid gap-2">
            {games.map((g) => (
              <li key={g.id}>
                <Link to={`/g/${g.id}`} className="flex items-center justify-between rounded-xl bg-white/10 px-4 py-3 hover:bg-white/15">
                  <span>
                    <span className="font-mono font-bold tracking-widest">{g.join_code}</span>
                    <span className="ml-2 text-sm text-white/60">{g.ruleset_name}</span>
                  </span>
                  <span className="text-xs uppercase text-white/60">{g.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link to="/rulesets" className="text-center text-sm text-white/60 underline">
        My saved rule sets
      </Link>
    </div>
  );
}
