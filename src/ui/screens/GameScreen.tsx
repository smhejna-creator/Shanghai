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
import { SwoopTableScreen } from './SwoopTableScreen';
import { GAMES } from '@/engine/index.ts';

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

  const { view } = data;
  const isHost = view.hostUserId === user.id;
  const roundNames = data.gameType === 'swoop' ? Array.from({ length: data.ruleSet.rounds }, (_, i) => `Hand ${i + 1}`) : data.ruleSet.rounds.map((r) => r.name);
  const nextRoundName = data.gameType === 'swoop' ? `hand ${view.roundIndex + 2}` : data.ruleSet.rounds[view.roundIndex + 1]?.name;
  const nextNoDiscard = data.gameType === 'shanghai' && data.ruleSet.rounds[view.roundIndex + 1]?.noDiscard;
  const wentOutText = data.gameType === 'shanghai' ? (data.view.wentOutSeat !== undefined ? `${data.view.players[data.view.wentOutSeat].name} went out.` : 'No one went out.') : `${data.view.players.find((p) => p.finished === 0)?.name ?? 'Someone'} was out first.`;

  let body: React.ReactNode;
  if (view.phase === 'lobby') body = <LobbyScreen game={data} gameId={id!} user={user} onError={setToast} />;
  else if (view.phase === 'round.over')
    body = (
      <div className="safe-top mx-auto flex max-w-md flex-col gap-4 px-5 py-6 animate-rise lg:max-w-2xl lg:py-12">
        <Logo size="sm" />
        <h1 className="font-display text-3xl font-bold">Round {view.roundIndex + 1} <span className="gold-text">complete</span></h1>
        <p className="text-white/70">
          {wentOutText} Next: {nextRoundName}
          {nextNoDiscard ? ' (no discard)' : ''}.
        </p>
        <Scoreboard players={view.players} roundNames={roundNames} upToRound={view.roundIndex} />
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
          <div className="label">{GAMES[data.gameType].title}</div>
          <div className="text-5xl">🏆</div>
          <div className="label !text-gold">Winner</div>
          <div className="font-display text-3xl font-bold">{view.winnerSeats?.map((s) => view.players[s].name).join(' & ')}</div>
        </div>
        <Scoreboard players={view.players} roundNames={roundNames} upToRound={roundNames.length - 1} final />
        <Button size="lg" onClick={() => nav('/')}>
          Back to home
        </Button>
      </div>
    );
  else if (data.gameType === 'swoop') body = <SwoopTableScreen game={data} gameId={id!} user={user} onError={setToast} />;
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
