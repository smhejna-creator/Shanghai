import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { RuleSet } from '@/engine/index.ts';
import { validateRuleSet } from '@/engine/index.ts';
import type { GameData } from '@/lib/supabase/useGame';
import { api } from '@/lib/supabase/api';
import { Button } from '../components/Button';
import { RuleSetEditor } from '../components/RuleSetEditor';
import { useSavedRuleSets } from './SetupScreen';

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
        await navigator.share({ title: 'Shang Hi', text: `Join my Shang Hi game: ${joinCode}`, url: shareUrl });
        return;
      } catch {
        /* fall through */
      }
    }
    await navigator.clipboard?.writeText(shareUrl);
    onError('Link copied');
  };

  const everyoneReady = view.players.every((p) => p.ready || p.userId === view.hostUserId);
  const canStart = isHost && view.players.length >= ruleSet.players.min && everyoneReady && validateRuleSet(ruleSet).length === 0;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-5 py-6">
      <header>
        <h1 className="text-2xl font-black text-amber-300">Lobby</h1>
        <p className="text-sm text-white/60">{ruleSet.name} · {ruleSet.rounds.length} rounds</p>
      </header>

      <section className="rounded-2xl bg-white/10 p-4 text-center">
        <div className="text-xs uppercase tracking-wide text-white/60">Join code</div>
        <div className="my-1 font-mono text-4xl font-black tracking-[0.3em]">{joinCode}</div>
        <Button variant="secondary" size="sm" onClick={share}>
          Share link
        </Button>
      </section>

      <section>
        <h2 className="mb-2 text-sm uppercase tracking-wide text-white/60">
          Players ({view.players.length}/{ruleSet.players.max})
        </h2>
        <ul className="grid gap-2">
          {view.players.map((p) => (
            <li key={p.seat} className="flex items-center justify-between rounded-xl bg-black/25 px-4 py-3">
              <span>
                {p.name}
                {p.userId === view.hostUserId && <span className="ml-2 rounded bg-amber-400/20 px-1.5 text-xs text-amber-300">host</span>}
                {p.seat === 0 && <span className="ml-2 text-xs text-white/50">deals first</span>}
              </span>
              <span className={`text-sm ${p.ready || p.userId === view.hostUserId ? 'text-emerald-300' : 'text-white/40'}`}>
                {p.userId === view.hostUserId ? '★' : p.ready ? 'Ready' : 'Not ready'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {me && !isHost && (
        <Button size="lg" variant={me.ready ? 'secondary' : 'primary'} disabled={busy} onClick={() => act(() => api.action(gameId, { type: 'READY', ready: !me.ready }))}>
          {me.ready ? 'Not ready' : "I'm ready"}
        </Button>
      )}
      {me && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => api.action(gameId, { type: 'LEAVE' }).then(() => (window.location.href = '/')))}>
          Leave game
        </Button>
      )}

      {isHost && (
        <section className="flex flex-col gap-3">
          <Button size="lg" disabled={!canStart || busy} onClick={() => act(() => api.action(gameId, { type: 'START' }))}>
            Start game
          </Button>
          {!everyoneReady && <p className="text-center text-xs text-white/60">Waiting for everyone to ready up.</p>}
          <Button variant="secondary" onClick={() => { setDraft(ruleSet); setEditing((e) => !e); }}>
            {editing ? 'Close rules' : 'Edit rules'}
          </Button>
          {editing && (
            <div className="rounded-2xl bg-white/5 p-3">
              <RuleSetEditor value={draft} onChange={setDraft} saved={saved} onSave={(n) => save(n, draft)} onDeleteSaved={remove} playerCount={view.players.length} />
              <Button
                className="mt-4 w-full"
                disabled={busy || validateRuleSet(draft).length > 0}
                onClick={() => act(async () => { await api.action(gameId, { type: 'SET_RULESET', ruleSet: draft }); setEditing(false); })}
              >
                Apply rules (players must re-ready)
              </Button>
            </div>
          )}
        </section>
      )}
      {!isHost && (
        <details className="rounded-xl bg-white/5 p-3 text-sm">
          <summary className="cursor-pointer">Rules summary</summary>
          <RulesSummary rs={ruleSet} />
        </details>
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
      <li className="mt-1 font-semibold">Rounds</li>
      {rs.rounds.map((r, i) => (
        <li key={r.id}>
          {i + 1}. {r.name}
          {r.noDiscard ? ' — no discard' : ''}
        </li>
      ))}
    </ul>
  );
}
