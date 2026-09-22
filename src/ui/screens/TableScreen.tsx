import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Card, Meld } from '@/engine/index.ts';
import { cardLabel, eligibleBuyers, findContractMelds, findLayOffs, handScore, isWild } from '@/engine/index.ts';
import type { GameData } from '@/lib/supabase/useGame';
import { api } from '@/lib/supabase/api';
import { Button } from '../components/Button';
import { CardView } from '../components/CardView';
import { Countdown } from '../components/Countdown';
import { Hand } from '../components/Hand';
import { MeldView } from '../components/MeldView';

type Mode = { kind: 'idle' } | { kind: 'layoff' } | { kind: 'replace'; meldId: string; wildCardId: string; naturalCardId: string };

export function TableScreen({ game, gameId, user, onError }: { game: GameData; gameId: string; user: User; onError: (m: string) => void }) {
  const { view, ruleSet: rs } = game;
  const me = view.players.find((p) => p.userId === user.id);
  const mySeat = me?.seat ?? -1;
  const myTurn = view.currentSeat === mySeat;
  const contract = rs.rounds[view.roundIndex];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<string[][]>([]);
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const hand = view.myHand;
  const handById = useMemo(() => new Map(hand.map((c) => [c.id, c])), [hand]);
  const reorderTimer = useRef<number>();

  // Drop selections for cards that left the hand.
  useEffect(() => {
    setSelected((s) => new Set([...s].filter((id) => handById.has(id))));
    setGroups((g) => g.map((grp) => grp.filter((id) => handById.has(id))).filter((grp) => grp.length > 0));
  }, [handById]);
  useEffect(() => {
    if (!myTurn) setMode({ kind: 'idle' });
  }, [myTurn]);

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      after?.();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const send = (action: Parameters<typeof api.action>[1], after?: () => void) => act(() => api.action(gameId, action, view.version), after);

  const toggle = (id: string) => {
    if (mode.kind === 'replace') return;
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const selectedCards = hand.filter((c) => selected.has(c.id));
  const stagedIds = new Set(groups.flat());

  const canDraw = myTurn && (view.phase === 'turn.draw' || view.phase === 'buy.window');
  const canPlay = myTurn && view.phase === 'turn.play';
  const buyers = eligibleBuyers(view);
  const canBuy = view.phase === 'buy.window' && buyers.includes(mySeat) && !myTurn;
  const iHoldPriority = view.buyWindow && view.buyWindow.order[view.buyWindow.index] === mySeat;
  const iClaimed = view.buyWindow?.claims.includes(mySeat);

  // ---- actions ----
  const stageGroup = () => {
    if (selectedCards.length === 0) return;
    setGroups((g) => [...g, selectedCards.map((c) => c.id)]);
    clearSelection();
  };
  const autoArrange = () => {
    const found = findContractMelds(hand, contract, rs);
    if (!found) {
      onError("Can't find the contract in your hand yet");
      return;
    }
    setGroups(found.map((g) => g.map((c) => c.id)));
    clearSelection();
  };
  const layDown = () => send({ type: 'LAY_DOWN', melds: groups }, () => setGroups([]));
  const discard = () => {
    if (selectedCards.length !== 1) return;
    send({ type: 'DISCARD', cardId: selectedCards[0].id }, clearSelection);
  };
  const layOffTo = (meld: Meld) => {
    if (selectedCards.length === 0) return;
    send({ type: 'LAY_OFF', meldId: meld.id, cardIds: selectedCards.map((c) => c.id) }, () => {
      clearSelection();
      setMode({ kind: 'idle' });
    });
  };
  const autoLayOff = () => {
    const plays = findLayOffs(hand, view.melds, rs, contract.noDiscard ? 0 : 1);
    if (plays.length === 0) {
      onError('Nothing in your hand fits on the table');
      return;
    }
    act(async () => {
      let version = view.version;
      for (const p of plays) {
        const r = await api.action(gameId, { type: 'LAY_OFF', meldId: p.meldId, cardIds: p.cardIds }, version);
        version = r.version;
      }
    }, clearSelection);
  };
  const tapMeldCard = (meld: Meld, cardId: string) => {
    if (!canPlay || !me?.hasLaidDown) return;
    const card = meld.cards.find((c) => c.id === cardId)!;
    if (meld.kind === 'run' && isWild(card, rs) && rs.wildReplacement.enabled && selectedCards.length === 1 && !isWild(selectedCards[0], rs)) {
      setMode({ kind: 'replace', meldId: meld.id, wildCardId: cardId, naturalCardId: selectedCards[0].id });
      return;
    }
    layOffTo(meld);
  };
  const tapMeld = (meld: Meld) => {
    if (!canPlay) return;
    if (mode.kind === 'replace') {
      send({ type: 'REPLACE_WILD', meldId: mode.meldId, wildCardId: mode.wildCardId, naturalCardId: mode.naturalCardId, playTo: { meldId: meld.id } }, () => {
        clearSelection();
        setMode({ kind: 'idle' });
      });
      return;
    }
    if (me?.hasLaidDown && selectedCards.length > 0) layOffTo(meld);
  };
  const onReorder = (ids: string[]) => {
    window.clearTimeout(reorderTimer.current);
    reorderTimer.current = window.setTimeout(() => api.action(gameId, { type: 'REORDER_HAND', cardIds: ids }).catch(() => {}), 600);
  };

  const topDiscard = view.discard[view.discard.length - 1];
  const others = view.players;

  return (
    <div className="flex h-full flex-col">
      {/* Header: round + contract */}
      <header className="flex items-center justify-between bg-black/30 px-3 py-2 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-white/60">
            Round {view.roundIndex + 1}/{rs.rounds.length}
            {contract.noDiscard && <span className="ml-2 rounded bg-red-500/40 px-1 text-[10px]">NO DISCARD</span>}
          </div>
          <div className="font-semibold capitalize">{contract.name}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-white/60">{myTurn ? 'Your turn' : `${view.players[view.currentSeat]?.name}'s turn`}</div>
          <Countdown deadline={view.phase === 'buy.window' ? view.buyWindow?.deadline : view.turnDeadline} className="text-lg font-bold" />
        </div>
      </header>

      {/* Players strip */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 py-2">
        {others.map((p) => (
          <div
            key={p.seat}
            className={`flex shrink-0 flex-col rounded-lg px-2 py-1 text-xs ${p.seat === view.currentSeat ? 'bg-amber-400 text-black' : 'bg-white/10'} ${!p.connected ? 'opacity-50' : ''}`}
          >
            <span className="font-semibold">
              {p.seat === view.dealerSeat && '🂠 '}
              {p.name}
              {p.seat === mySeat && ' (you)'}
            </span>
            <span className="opacity-80">
              {p.handCount} cards · {p.buysLeft} buy{p.buysLeft === 1 ? '' : 's'}
              {p.hasLaidDown && ' · ✓ down'}
            </span>
          </div>
        ))}
      </div>

      {/* Table: melds + piles */}
      <main className="flex-1 overflow-y-auto px-3 pb-2">
        <div className="mb-3 flex items-center gap-4 rounded-xl bg-black/20 p-3">
          <button
            className="flex flex-col items-center gap-1 disabled:opacity-60"
            disabled={!canDraw || busy}
            onClick={() => send({ type: 'DRAW_STOCK' })}
          >
            <CardView card={{ id: 'stock', rank: 'A', suit: 'S', deck: 0 }} ruleSet={rs} faceDown />
            <span className="text-xs text-white/70">Stock · {view.stockCount}</span>
          </button>
          <button
            className="flex flex-col items-center gap-1 disabled:opacity-60"
            disabled={!canDraw || !topDiscard || busy}
            onClick={() => send({ type: 'DRAW_DISCARD' })}
          >
            {topDiscard ? <CardView card={topDiscard} ruleSet={rs} /> : <div className="h-20 w-14 rounded-md border border-dashed border-white/30" />}
            <span className="text-xs text-white/70">Discard · {view.discard.length}</span>
          </button>
          <div className="flex-1 text-sm">
            {view.phase === 'buy.window' && view.buyWindow && (
              <div className="rounded-lg bg-white/10 p-2">
                <div className="text-xs uppercase text-white/60">Buy window</div>
                <div>
                  {view.players[view.buyWindow.order[view.buyWindow.index]]?.name} has priority <Countdown deadline={view.buyWindow.deadline} />
                </div>
                {canBuy && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" disabled={busy || iClaimed} onClick={() => send({ type: 'BUY' })}>
                      {iClaimed ? 'Claimed' : iHoldPriority ? 'Buy now' : 'Buy if free'}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => send({ type: 'PASS_BUY' })}>
                      Pass
                    </Button>
                  </div>
                )}
                {myTurn && <div className="mt-1 text-xs text-white/60">Drawing from stock ends the window.</div>}
              </div>
            )}
            {view.phase === 'turn.draw' && myTurn && <div className="text-white/80">Draw from the stock or take the discard.</div>}
            {view.phase === 'turn.play' && myTurn && (
              <div className="text-white/80">
                {mode.kind === 'replace' ? 'Tap the meld where the freed wild should go.' : me?.hasLaidDown ? 'Select cards, then tap a meld to lay off.' : 'Build your contract, then discard.'}
              </div>
            )}
          </div>
        </div>

        {view.melds.length === 0 && <p className="py-4 text-center text-sm text-white/50">No melds on the table yet.</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {view.melds.map((m) => (
            <MeldView
              key={m.id}
              meld={m}
              ruleSet={rs}
              ownerName={view.players[m.ownerSeat]?.name ?? ''}
              highlight={mode.kind === 'replace' && mode.meldId === m.id}
              onTap={canPlay ? () => tapMeld(m) : undefined}
              onTapCard={canPlay && me?.hasLaidDown ? (id) => tapMeldCard(m, id) : undefined}
            />
          ))}
        </div>

        {/* Staged lay-down groups */}
        {groups.length > 0 && (
          <div className="mt-3 rounded-xl bg-sky-400/10 p-2">
            <div className="mb-1 flex items-center justify-between text-xs uppercase text-white/60">
              <span>Ready to lay down ({groups.length}/{contract.melds.length})</span>
              <button onClick={() => setGroups([])}>clear</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {groups.map((g, gi) => (
                <button key={gi} className="flex rounded bg-black/30 p-1" onClick={() => setGroups((x) => x.filter((_, i) => i !== gi))} title="Remove group">
                  {g.map((id) => handById.get(id)).filter((c): c is Card => Boolean(c)).map((c) => (
                    <div key={c.id} className="-ml-3 first:ml-0">
                      <CardView card={c} ruleSet={rs} small />
                    </div>
                  ))}
                </button>
              ))}
            </div>
          </div>
        )}

        <details className="mt-3 text-xs text-white/50">
          <summary>Log</summary>
          <ul className="mt-1">
            {view.log.slice().reverse().map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </details>
      </main>

      {/* Hand + action bar */}
      <footer className="safe-bottom bg-black/40">
        <div className="flex items-center justify-between px-3 pt-2 text-xs text-white/60">
          <span>
            Your hand · {hand.length} cards · {handScore(hand, rs)} pts
            {me && ` · ${me.buysLeft} buys left`}
          </span>
          {selected.size > 0 && (
            <button onClick={clearSelection} className="underline">
              clear {selected.size}
            </button>
          )}
        </div>
        <Hand cards={hand.filter((c) => !stagedIds.has(c.id))} ruleSet={rs} selected={selected} onToggle={toggle} onReorder={onReorder} />
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-3">
          {canPlay && !me?.hasLaidDown && (
            <>
              <Button size="sm" variant="secondary" disabled={selected.size === 0 || busy} onClick={stageGroup}>
                Group ({selected.size})
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={autoArrange}>
                Auto
              </Button>
              <Button size="sm" disabled={groups.length !== contract.melds.length || busy} onClick={layDown}>
                Lay down
              </Button>
            </>
          )}
          {canPlay && me?.hasLaidDown && rs.layOff !== 'never' && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={autoLayOff}>
              Auto lay off
            </Button>
          )}
          {canPlay && mode.kind === 'replace' && (
            <Button size="sm" variant="ghost" onClick={() => setMode({ kind: 'idle' })}>
              Cancel replace
            </Button>
          )}
          {canPlay && !contract.noDiscard && (
            <Button size="sm" variant="danger" disabled={selected.size !== 1 || busy} onClick={discard}>
              Discard {selectedCards.length === 1 ? cardLabel(selectedCards[0]) : ''}
            </Button>
          )}
          {canPlay && contract.noDiscard && (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => send({ type: 'END_TURN' })}>
              End turn
            </Button>
          )}
          {!myTurn && view.phase !== 'buy.window' && <span className="py-2 text-sm text-white/50">Waiting for {view.players[view.currentSeat]?.name}…</span>}
        </div>
      </footer>
    </div>
  );
}
