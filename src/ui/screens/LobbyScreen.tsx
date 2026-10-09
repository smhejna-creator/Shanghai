import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { RuleSet, SwoopRuleSet } from '@/engine/index.ts';
import { GAMES } from '@/engine/index.ts';
import type { GameData } from '@/lib/supabase/useGame';
import { api } from '@/lib/supabase/api';
import { Button } from '../components/Button';
import { Felt, seatPosition, useIsDesktop } from '../components/Felt';
import { Logo } from '../components/Logo';
import { Seat } from '../components/Seat';
import { RulesEditor, validateAny } from './SetupScreen';

const BOT_NAMES = ['Ada', 'Turing', 'Hal', 'Marvin', 'Data', 'Bender'];

export function LobbyScreen({ game, gameId, user, onError }: { game: GameData; gameId: string; user: User; onError: (m: string) => void }) {
  const { view, ruleSet, joinCode, gameType } = game;
  const mod = GAMES[gameType];
  const roundsLabel = gameType === 'swoop' ? `${(ruleSet as SwoopRuleSet).rounds} hand${(ruleSet as SwoopRuleSet).rounds === 1 ? '' : 's'}` : `${(ruleSet as RuleSet).rounds.length} rounds`;
  const firstLabel = gameType === 'swoop' ? `${(ruleSet as SwoopRuleSet).faceDown} down · ${(ruleSet as SwoopRuleSet).faceUp} up · ${(ruleSet as SwoopRuleSet).handSize} in hand` : `first: ${(ruleSet as RuleSet).rounds[0]?.name}`;
  const me = view.players.find((p) => p.userId === user.id);
  const isHost = view.hostUserId === user.id;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RuleSet | SwoopRuleSet>(ruleSet);
  const [busy, setBusy] = useState(false);
  const desktop = useIsDesktop();
  const [copied, setCopied] = useState(false);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const shareUrl = `${window.location.origin}/join/${joinCode}`;
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: mod.title, text: `Join my ${mod.title} table: ${joinCode}`, url: shareUrl });
        return;
      } catch {
        /* fall through */
      }
    }
    await navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const everyoneReady = view.players.every((p) => p.ready || p.userId === view.hostUserId);
  const canStart = isHost && view.players.length >= ruleSet.players.min && everyoneReady && validateAny(gameType, ruleSet).length === 0;
  const others = view.players.filter((p) => p.userId !== user.id);
  const openSeats = Math.max(0, ruleSet.players.max - view.players.length);

  const layout = desktop ? 'ring' : 'arc';
  const slots = others.length + openSeats;
  const startHint = !isHost
    ? null
    : view.players.length < ruleSet.players.min
      ? `Need at least ${ruleSet.players.min} players. Share the invite code or add a bot.`
      : !everyoneReady
        ? 'Waiting for everyone to tap "I\'m ready".'
        : null;

  const invitePanel = (
    <div className="panel p-4 lg:p-5">
      <div className="label">Invite code</div>
      <div className="mt-1 flex items-center gap-3">
        <div className="font-mono text-3xl font-extrabold tracking-[0.3em] text-gold lg:text-4xl">{joinCode}</div>
        <Button variant="outline" size="sm" onClick={share}>{copied ? 'Copied ✓' : 'Copy invite link'}</Button>
      </div>
      <p className="mt-2 text-xs text-white/50">Friends open <span className="text-white/80">{window.location.host}</span>, enter the code, and they're seated. No account needed.</p>
    </div>
  );

  const playersPanel = (
    <section className="panel divide-y divide-line">
      {view.players.map((p) => (
        <div key={p.seat} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2">
            {p.isBot && <span>🤖</span>}
            <span className="font-semibold">{p.name}</span>
            {p.userId === view.hostUserId && <span className="rounded bg-gold/15 px-1.5 text-[10px] font-bold uppercase tracking-wider text-gold">host</span>}
            {p.seat === 0 && <span className="text-[10px] uppercase tracking-wider text-white/40">deals first</span>}
          </span>
          <span className="text-xs">
            {p.isBot && isHost ? (
              <button className="text-red-300 hover:text-red-200" disabled={busy} onClick={() => act(() => api.action(gameId, { type: 'REMOVE_BOT', botId: p.userId }))}>Remove</button>
            ) : p.userId === view.hostUserId ? (
              <span className="text-gold">★</span>
            ) : p.ready ? (
              <span className="font-semibold text-emerald-300">Ready</span>
            ) : (
              <span className="text-white/40">Not ready</span>
            )}
          </span>
        </div>
      ))}
      {openSeats > 0 && <div className="px-4 py-2 text-xs text-white/40">{openSeats} open seat{openSeats === 1 ? '' : 's'}</div>}
    </section>
  );

  const actions = (
    <>
      {me && !isHost && (
        <Button size="lg" variant={me.ready ? 'secondary' : 'primary'} disabled={busy} onClick={() => act(() => api.action(gameId, { type: 'READY', ready: !me.ready }))}>
          {me.ready ? 'Not ready' : "I'm ready"}
        </Button>
      )}
      {isHost && (
        <section className="flex flex-col gap-2">
          <Button size="lg" disabled={!canStart || busy} onClick={() => act(() => api.action(gameId, { type: 'START' }))}>Deal the cards</Button>
          {startHint && <p className="text-center text-xs text-white/60">{startHint}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy || openSeats === 0} onClick={() => act(() => api.action(gameId, { type: 'ADD_BOT', name: BOT_NAMES[view.players.filter((p) => p.isBot).length % BOT_NAMES.length] }))}>🤖 Add a bot</Button>
            <Button variant="secondary" onClick={() => { setDraft(ruleSet); setEditing((e) => !e); }}>{editing ? 'Close rules' : '⚙ House rules'}</Button>
          </div>
          {editing && (
            <div className="panel p-3">
              <RulesEditor gameType={gameType} value={draft} onChange={setDraft} userId={user.id} playerCount={view.players.length} />
              <Button className="mt-4 w-full" disabled={busy || validateAny(gameType, draft).length > 0} onClick={() => act(async () => { await api.action(gameId, { type: 'SET_RULESET', ruleSet: draft } as Parameters<typeof api.action>[1]); setEditing(false); })}>
                Apply rules (players must re-ready)
              </Button>
            </div>
          )}
        </section>
      )}
      {!isHost && (
        <details className="panel p-3 text-sm">
          <summary className="cursor-pointer font-semibold">House rules</summary>
          {gameType === 'swoop' ? <SwoopRulesSummary rs={ruleSet as SwoopRuleSet} /> : <RulesSummary rs={ruleSet as RuleSet} />}
        </details>
      )}
      {me && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => api.action(gameId, { type: 'LEAVE' }).then(() => (window.location.href = '/')))}>Leave table</Button>
      )}
    </>
  );

  const table = (
    <Felt className="h-[300px] lg:h-[min(60vh,560px)]">
      {others.map((p, i) => (
        <div key={p.seat} className="absolute -translate-x-1/2 -translate-y-1/2" style={seatPosition(i, slots, layout)}>
          <Seat player={p} active={false} isDealer={p.seat === 0} isMe={false} compact={!desktop} hideStats />
        </div>
      ))}
      {Array.from({ length: openSeats }, (_, k) => (
        <div key={`open-${k}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={seatPosition(others.length + k, slots, layout)}>
          <div className="flex flex-col items-center gap-1 opacity-40">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-white/50 text-white/60 lg:h-12 lg:w-12">·</div>
            <div className="text-[9px] uppercase tracking-wider text-white/60">empty</div>
          </div>
        </div>
      ))}
      <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 text-center lg:top-1/2">
        <div className="label !text-white/70">Waiting to deal</div>
        <div className="mt-1 font-display text-2xl font-bold text-white/90 lg:text-3xl">{mod.title}</div>
        <div className="mt-1 text-xs text-white/60">{ruleSet.name} · {roundsLabel} · {firstLabel}</div>
      </div>
      {me && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 lg:bottom-4">
          <Seat player={me} active={false} isDealer={me.seat === 0} isMe compact={!desktop} hideStats />
        </div>
      )}
    </Felt>
  );

  return (
    <div className="safe-top mx-auto flex max-w-md flex-col gap-4 px-4 py-4 lg:max-w-[1400px] lg:px-8 lg:py-6">
      <header className="flex items-center justify-between">
        <Logo size="sm" className="!items-start" title={mod.title.toUpperCase()} subtitle="Winning Hand" />
        <div className="text-right">
          <div className="label">{mod.title} · {ruleSet.name}</div>
          <div className="text-xs text-white/50">{roundsLabel} · {ruleSet.players.min}–{ruleSet.players.max} players</div>
        </div>
      </header>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">{table}<div className="hidden lg:block">{invitePanel}</div></div>
        <div className="flex flex-col gap-4">
          <div className="lg:hidden">{invitePanel}</div>
          {playersPanel}
          {actions}
        </div>
      </div>
    </div>
  );
}

export function RulesSummary({ rs }: { rs: RuleSet }) {
  return (
    <ul className="mt-2 grid gap-1 text-white/80">
      <li>{rs.decks} decks + {rs.decks * rs.jokersPerDeck} jokers · {rs.cardsPerRound} cards each</li>
      <li>Wild: jokers{rs.wilds.ranks.length ? ` + ${rs.wilds.ranks.join(', ')}s` : ''}</li>
      <li>{rs.buysPerRound} buys per round (+{rs.buyPenaltyCards} penalty card{rs.buyPenaltyCards === 1 ? '' : 's'})</li>
      <li>Aces {rs.acesHighLow === 'either' ? 'high or low' : rs.acesHighLow}</li>
      <li>Turn timer {rs.turnTimerSeconds ? `${rs.turnTimerSeconds}s` : 'off'}</li>
      <li className="mt-1 font-semibold text-white">Rounds</li>
      {rs.rounds.map((r, i) => (
        <li key={r.id}>{i + 1}. {r.name}{r.noDiscard ? ' — no discard' : ''}</li>
      ))}
    </ul>
  );
}

export function SwoopRulesSummary({ rs }: { rs: SwoopRuleSet }) {
  return (
    <ul className="mt-2 grid gap-1 text-white/80">
      <li>{rs.faceDown} face-down, {rs.faceUp} face-up, {rs.handSize} in hand · draw back to {rs.refillTo}</li>
      <li>{rs.decks} deck{rs.decks === 1 ? '' : 's'} + {rs.decks * rs.jokersPerDeck} jokers</li>
      <li>Swoop (clears the pile): {rs.clearRanks.join(', ') || 'none'}{rs.jokersClear ? ' + jokers' : ''}{rs.afterClear === 'playAgain' ? ', then play again' : ''}</li>
      <li>Reset (anything follows): {rs.resetRanks.join(', ') || 'none'}{rs.jokersClear ? '' : ' + jokers'}</li>
      <li>{rs.fourOfAKindClears ? 'Four of a kind clears the pile' : 'Four of a kind does nothing special'}</li>
      {rs.sevenLower && <li>After a 7, the next card must be 7 or lower</li>}
      <li>Aces {rs.acesHigh ? 'high' : 'low'} · {rs.swapPhase ? 'swap before play' : 'no swapping'} · {rs.voluntaryPickup ? 'may pick up anytime' : 'must play if able'}</li>
      <li>{rs.rounds} hand{rs.rounds === 1 ? '' : 's'} · turn timer {rs.turnTimerSeconds ? `${rs.turnTimerSeconds}s` : 'off'}</li>
    </ul>
  );
}
