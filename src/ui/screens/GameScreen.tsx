import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { useGame } from '@/lib/supabase/useGame';
import { api } from '@/lib/supabase/api';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Scoreboard } from '../components/Scoreboard';
import { LobbyScreen } from './LobbyScreen';
import { TableScreen } from './TableScreen';

export function GameScreen({ user }: { user: User }) {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, error, loading } = useGame(id, user.id);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading) return <Centered>Loading game…</Centered>;
  if (error === 'not-a-member' || !data)
    return (
      <Centered>
        <p>You're not in this game (or it doesn't exist).</p>
        <Link to="/" className="underline">
          Home
        </Link>
      </Centered>
    );
  if (error) return <Centered>{error}</Centered>;

  const { view, ruleSet } = data;
  const isHost = view.hostUserId === user.id;

  let body: React.ReactNode;
  if (view.phase === 'lobby') body = <LobbyScreen game={data} gameId={id!} user={user} onError={setToast} />;
  else if (view.phase === 'round.over')
    body = (
      <div className="safe-top mx-auto flex max-w-md flex-col gap-4 px-5 py-6 animate-rise lg:max-w-2xl lg:py-12">
        <Logo size="sm" />
        <h1 className="font-display text-3xl font-bold">Round {view.roundIndex + 1} <span className="gold-text">complete</span></h1>
        <p className="text-white/70">
          {view.wentOutSeat !== undefined ? `${view.players[view.wentOutSeat].name} went out.` : 'No one went out.'} Next: {ruleSet.rounds[view.roundIndex + 1]?.name}
          {ruleSet.rounds[view.roundIndex + 1]?.noDiscard ? ' (no discard)' : ''}.
        </p>
        <Scoreboard players={view.players} ruleSet={ruleSet} upToRound={view.roundIndex} />
        {isHost ? (
          <Button size="lg" onClick={() => api.action(id!, { type: 'NEXT_ROUND' }).catch((e) => setToast(e.message))}>
            Deal round {view.roundIndex + 2}
          </Button>
        ) : (
          <p className="text-center text-sm text-white/60">Waiting for the host to deal the next round.</p>
        )}
      </div>
    );
  else if (view.phase === 'game.over')
    body = (
      <div className="safe-top mx-auto flex max-w-md flex-col gap-4 px-5 py-6 animate-rise lg:max-w-2xl lg:py-12">
        <Logo size="sm" />
        <div className="panel flex flex-col items-center gap-1 border-gold/40 p-5 text-center">
          <div className="text-5xl">🏆</div>
          <div className="label !text-gold">Winner</div>
          <div className="font-display text-3xl font-bold">{view.winnerSeats?.map((s) => view.players[s].name).join(' & ')}</div>
        </div>
        <Scoreboard players={view.players} ruleSet={ruleSet} upToRound={ruleSet.rounds.length - 1} final />
        <Button size="lg" onClick={() => nav('/')}>
          Back to home
        </Button>
      </div>
    );
  else body = <TableScreen game={data} gameId={id!} user={user} onError={setToast} />;

  return (
    <div className="h-full">
      {body}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
          <div className="rounded-xl border border-gold/30 bg-ink-2/95 px-4 py-2 text-sm text-white shadow-panel backdrop-blur">{toast}</div>
        </div>
      )}
    </div>
  );
}

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center text-white/80">{children}</div>
);
