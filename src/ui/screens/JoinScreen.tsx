import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { GAMES } from '@/engine/index.ts';
import { api } from '@/lib/supabase/api';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';

/** /join/:code — shareable link target. */
export function JoinScreen({ user }: { user: User }) {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.lookupGame>> | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.lookupGame(code).then(setInfo).catch(() => setInfo(null));
    api.profile(user.id).then((n) => setName(n || user.email?.split('@')[0] || 'Player'));
  }, [code, user.id, user.email]);

  const join = async () => {
    setError(null);
    try {
      const r = await api.joinGame(code, name);
      nav(`/g/${r.gameId}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="safe-top mx-auto flex min-h-full max-w-sm flex-col justify-center gap-5 px-5 py-10">
      <Logo />
      <div className="panel p-5">
        <div className="label">You're invited to table</div>
        <div className="my-2 font-mono text-3xl font-extrabold tracking-[0.35em] text-gold">{code}</div>
        {info === undefined && <p className="text-white/60">Looking up table…</p>}
        {info === null && <p className="text-red-300">No table with that code.</p>}
        {info && (
          <>
            <p className="mb-4 text-sm text-white/70">
              <b className="text-gold">{GAMES[info.game_type]?.title ?? 'Shanghai'}</b> · hosted by <b className="text-white">{info.host_name}</b> · {info.player_count} seated · {info.ruleset_name}
            </p>
            <label className="label">Your name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} className="input mb-3 mt-2" placeholder="Your name" />
            {error && <p className="mb-2 text-sm text-red-300">{error}</p>}
            <Button size="lg" className="w-full" onClick={join} disabled={!name.trim()}>
              {info.status === 'lobby' ? 'Take a seat' : 'Rejoin'}
            </Button>
          </>
        )}
      </div>
      <Button variant="ghost" onClick={() => nav('/')}>Back</Button>
    </div>
  );
}
