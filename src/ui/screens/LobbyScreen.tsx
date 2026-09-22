import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { RuleSet } from '@/engine/index.ts';
import { validateRuleSet } from '@/engine/index.ts';
import type { GameData } from '@/lib/supabase/useGame';
import { api } from '@/lib/supabase/api';
import { Button } from '../components/Button';
import { Felt, arcPosition } from '../components/Felt';
import { Logo } from '../components/Logo';
import { RuleSetEditor } from '../components/RuleSetEditor';
import { Seat } from '../components/Seat';
import { useSavedRuleSets } from './SetupScreen';

const BOT_NAMES = ['Ada', 'Turing', 'Hal', 'Marvin', 'Data', 'Bender'];

export function LobbyScreen({ game, gameId, user, onError }: { game: GameData; gameId: string; user: User; onError: (m: string) => void }) {
  const { view, ruleSet, joinCode } = game;
  const me = view.players.find((p) => p.userId === user.id);
  const isHost = view.hostUserId === user.id;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RuleSet>(ruleSet);
  const [busy, setBusy] = useState(false);
  const { saved, save, remove } = useSavedRuleSets(user.id);

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
        await navigator.share({ title: 'Shanghai', text: `Join my Shanghai table: ${joinCode}`, url: shareUrl });
        return;
      } catch {
        /* fall through */
      }
    }
    await navigator.clipboard?.writeText(shareUrl);
    onError('Invite link copied');
  };

  const everyoneReady = view.players.every((p) => p.ready || p.userId === view.hostUserId);
  const canStart = isHost && view.players.length >= ruleSet.players.min && everyoneReady && validateRuleSet(ruleSet).length === 0;
  const others = view.players.filter((p) => p.userId !== user.id);
  const openSeats = Math.max(0, ruleSet.players.max - view.players.length);

  return (
    <div className="safe-top mx-auto flex max-w-md flex-col gap-4 px-4 py-4">
      <header className="flex items-center justify-between">
        <Logo size="sm" className="!items-start" />
        <div className="text-right">
          <div className="label">{ruleSet.name}</div>
          <div className="text-xs text-white/50">{ruleSet.rounds.length} rounds · {ruleSet.players.min}–{ruleSet.players.max} players</div>
        </div>
      </header>

      <Felt className="h-[300px]">
        {others.map((p, i) => (
          <div key={p.seat} className="absolute -translate-x-1/2 -translate-y-1/2" style={arcPosition(i, others.length + openSeats)}>
            <Seat player={p} active={false} isDealer={p.seat === 0} isMe={false} compact />
          </div>
        ))}
        {Array.from({ length: openSeats }, (_, k) => (
          <div key={`open-${k}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={arcPosition(others.length + k, others.length + openSeats)}>
            <div className="flex flex-col items-center gap-1 opacity-60">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-white/40 text-white/50">+</div>
              <div className="text-[10px] uppercase tracking-wider text-white/50">open</div>
            </div>
          </div>
        ))}
        <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="label !text-white/70">Invite code</div>
          <button onClick={share} className="mt-1 rounded-xl bg-black/35 px-4 py-2 font-mono text-3xl font-extrabold tracking-[0.35em] text-gold shadow-lg ring-1 ring-gold/40 active:scale-95">
            {joinCode}
          </button>
          <div className="mt-1 text-[10px] text-white/60">tap to share</div>
        </div>
        {me && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <Seat player={me} active={false} isDealer={me.seat === 0} isMe compact />
          </div>
        )}
      </Felt>

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
                <button className="text-red-300 hover:text-red-200" disabled={busy} onClick={() => act(() => api.action(gameId, { type: 'REMOVE_BOT', botId: p.userId }))}>
                  Remove
                </button>
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
      </section>

      {me && !isHost && (
        <Button size="lg" variant={me.ready ? 'secondary' : 'primary'} disabled={busy} onClick={() => act(() => api.action(gameId, { type: 'READY', ready: !me.ready }))}>
          {me.ready ? 'Not ready' : "I'm ready"}
        </Button>
      )}

      {isHost && (
        <section className="flex flex-col gap-2">
          <Button size="lg" disabled={!canStart || busy} onClick={() => act(() => api.action(gameId, { type: 'START' }))}>
            Deal the cards
          </Button>
          {!everyoneReady && <p className="text-center text-xs text-white/50">Waiting for everyone to ready up.</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy || openSeats === 0} onClick={() => act(() => api.action(gameId, { type: 'ADD_BOT', name: BOT_NAMES[view.players.filter((p) => p.isBot).length % BOT_NAMES.length] }))}>
              🤖 Add a bot
            </Button>
            <Button variant="secondary" onClick={() => { setDraft(ruleSet); setEditing((e) => !e); }}>
              {editing ? 'Close rules' : '⚙ House rules'}
            </Button>
          </div>
          {editing && (
            <div className="panel p-3">
              <RuleSetEditor value={draft} onChange={setDraft} saved={saved} onSave={(n) => save(n, draft)} onDeleteSaved={remove} playerCount={view.players.length} />
              <Button className="mt-4 w-full" disabled={busy || validateRuleSet(draft).length > 0} onClick={() => act(async () => { await api.action(gameId, { type: 'SET_RULESET', ruleSet: draft }); setEditing(false); })}>
                Apply rules (players must re-ready)
              </Button>
            </div>
          )}
        </section>
      )}
      {!isHost && (
        <details className="panel p-3 text-sm">
          <summary className="cursor-pointer font-semibold">House rules</summary>
          <RulesSummary rs={ruleSet} />
        </details>
      )}
      {me && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => api.action(gameId, { type: 'LEAVE' }).then(() => (window.location.href = '/')))}>
          Leave table
        </Button>
      )}
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
