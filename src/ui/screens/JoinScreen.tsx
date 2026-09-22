import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { api } from '@/lib/supabase/api';
import { Button } from '../components/Button';

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
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-4 px-6 py-10">
      <h1 className="text-2xl font-black text-amber-300">Join game {code}</h1>
      {info === undefined && <p>Looking up game…</p>}
      {info === null && <p className="text-red-300">No game with that code.</p>}
      {info && (
        <>
          <p className="text-white/80">
            Hosted by <b>{info.host_name}</b> · {info.player_count} player{info.player_count === 1 ? '' : 's'} · {info.ruleset_name}
          </p>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} className="rounded-xl bg-white px-4 py-3 text-black" placeholder="Your name" />
          {error && <p className="text-sm text-red-300">{error}</p>}
          <Button size="lg" onClick={join} disabled={!name.trim()}>
            {info.status === 'lobby' ? 'Join' : 'Rejoin'}
          </Button>
        </>
      )}
      <Button variant="ghost" onClick={() => nav('/')}>
        Back
      </Button>
    </div>
  );
}
