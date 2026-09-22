import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Card, Meld } from '@/engine/index.ts';
import { cardLabel, eligibleBuyers, findContractMelds, findLayOffs, handScore, isWild, rankValue, type Rank } from '@/engine/index.ts';
import type { GameData } from '@/lib/supabase/useGame';
import { api } from '@/lib/supabase/api';
import { Button } from '../components/Button';
import { CardStack, CardView } from '../components/CardView';
import { Countdown } from '../components/Countdown';
import { Felt, arcPosition } from '../components/Felt';
import { Hand } from '../components/Hand';
import { MeldView } from '../components/MeldView';
import { Seat } from '../components/Seat';

type Mode = { kind: 'idle' } | { kind: 'replace'; meldId: string; wildCardId: string; naturalCardId: string };

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
  const [order, setOrder] = useState<string[]>(() => hand.map((c) => c.id));

  // Keep the player's arrangement; new cards go on the right.
  useEffect(() => {
    setOrder((prev) => {
      const kept = prev.filter((id) => handById.has(id));
      const added = hand.map((c) => c.id).filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
    });
  }, [hand, handById]);
  const orderedHand = useMemo(() => order.map((id) => handById.get(id)).filter((c): c is Card => Boolean(c)), [order, handById]);

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
  const stagedIds = useMemo(() => new Set(groups.flat()), [groups]);
  const unstagedHand = useMemo(() => orderedHand.filter((c) => !stagedIds.has(c.id)), [orderedHand, stagedIds]);

  const canDraw = myTurn && (view.phase === 'turn.draw' || view.phase === 'buy.window');
  const canPlay = myTurn && view.phase === 'turn.play';
  const buyers = eligibleBuyers(view);
  const canBuy = view.phase === 'buy.window' && buyers.includes(mySeat) && !myTurn;
  const iHoldPriority = view.buyWindow && view.buyWindow.order[view.buyWindow.index] === mySeat;
  const iClaimed = view.buyWindow?.claims.includes(mySeat);

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
  const tapMeldCard = (meld: Meld, cardId: string) => {
    if (!canPlay || !me?.hasLaidDown) return;
    if (mode.kind === 'replace') {
      tapMeld(meld);
      return;
    }
    const card = meld.cards.find((c) => c.id === cardId)!;
    if (meld.kind === 'run' && isWild(card, rs) && rs.wildReplacement.enabled && selectedCards.length === 1 && !isWild(selectedCards[0], rs)) {
      setMode({ kind: 'replace', meldId: meld.id, wildCardId: cardId, naturalCardId: selectedCards[0].id });
      return;
    }
    layOffTo(meld);
  };
  /** Apply a new order for the unstaged cards; staged cards keep their place at the end. Persists after a short delay. */
  const applyOrder = (ids: string[]) => {
    const full = [...ids, ...groups.flat().filter((id) => handById.has(id))];
    setOrder(full);
    window.clearTimeout(reorderTimer.current);
    reorderTimer.current = window.setTimeout(() => api.action(gameId, { type: 'REORDER_HAND', cardIds: full }).catch(() => {}), 600);
  };
  const onReorder = (ids: string[]) => applyOrder(ids);
  const value = (c: Card) => (isWild(c, rs) ? 99 : rankValue(c.rank as Rank, rs.acesHighLow === 'high' ? 14 : 1));
  const suitOrder = (c: Card) => (isWild(c, rs) ? 9 : 'SHDC'.indexOf(c.suit));
  const sortHand = (by: 'rank' | 'suit') => {
    const sorted = unstagedHand.slice().sort((a, b) => (by === 'rank' ? value(a) - value(b) || suitOrder(a) - suitOrder(b) : suitOrder(a) - suitOrder(b) || value(a) - value(b)));
    applyOrder(sorted.map((c) => c.id));
  };
  /** Move the selected cards one step left or right, keeping them together. */
  const nudge = (dir: -1 | 1) => {
    const ids = unstagedHand.map((c) => c.id);
    const sel = ids.filter((id) => selected.has(id));
    if (sel.length === 0) return;
    const rest = ids.filter((id) => !selected.has(id));
    const first = ids.indexOf(sel[0]);
    const last = ids.indexOf(sel[sel.length - 1]);
    // Insert position in `rest`: number of unselected cards before the block, shifted by one.
    let pos = ids.slice(0, first).filter((id) => !selected.has(id)).length;
    if (dir > 0) {
      const after = ids.slice(last + 1).filter((id) => !selected.has(id));
      if (after.length === 0) return;
      pos += 1;
    } else {
      if (pos === 0) return;
      pos -= 1;
    }
    const next = [...rest.slice(0, pos), ...sel, ...rest.slice(pos)];
    applyOrder(next);
  };
  /** Order the hand so cards that make sets or runs sit together. */
  const autoGroup = () => {
    const cards = unstagedHand.slice();
    const used = new Set<string>();
    const groupsOut: Card[][] = [];
    // Sets of 2+ by rank
    const byRank = new Map<string, Card[]>();
    for (const c of cards) if (!isWild(c, rs)) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
    for (const list of byRank.values()) if (list.length >= 2) { groupsOut.push(list); list.forEach((c) => used.add(c.id)); }
    // Runs of 2+ by suit among the rest
    for (const suit of ['S', 'H', 'D', 'C']) {
      const list = cards.filter((c) => !used.has(c.id) && !isWild(c, rs) && c.suit === suit).sort((a, b) => value(a) - value(b));
      let run: Card[] = [];
      const flush = () => { if (run.length >= 2) { groupsOut.push(run); run.forEach((c) => used.add(c.id)); } run = []; };
      for (const c of list) {
        if (run.length && value(c) - value(run[run.length - 1]) > 2) flush();
        if (!run.length || value(c) !== value(run[run.length - 1])) run.push(c);
      }
      flush();
    }
    const wilds = cards.filter((c) => isWild(c, rs));
    const loose = cards.filter((c) => !used.has(c.id) && !isWild(c, rs)).sort((a, b) => value(a) - value(b));
    applyOrder([...groupsOut.flat(), ...loose, ...wilds].map((c) => c.id));
  };

  const topDiscard = view.discard[view.discard.length - 1];
  const others = view.players.filter((p) => p.seat !== mySeat);
  const current = view.players[view.currentSeat];
  const bw = view.buyWindow;
  const priorityName = bw ? view.players[bw.order[bw.index]]?.name : undefined;

  const status = (() => {
    if (view.phase === 'buy.window' && bw) {
      if (canBuy) return iHoldPriority ? 'You have first claim on the discard.' : `${priorityName} has priority. Claim to buy if they pass.`;
      if (myTurn) return `Buy window open. ${priorityName} deciding… draw from stock to end it.`;
      return `${priorityName} deciding whether to buy…`;
    }
    if (view.phase === 'turn.draw') return myTurn ? 'Draw from the stock or take the discard.' : `${current?.name} is drawing…`;
    if (view.phase === 'turn.play') {
      if (!myTurn) return `${current?.name} is playing…`;
      if (mode.kind === 'replace') return 'Tap the meld where the freed wild should go.';
      return me?.hasLaidDown ? 'Select cards, then tap a meld to lay off.' : 'Build your contract, then discard.';
    }
    return '';
  })();

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="safe-top flex items-center justify-between border-b border-line bg-ink-2/80 px-3 py-2 backdrop-blur">
        <div>
          <div className="label">Round {view.roundIndex + 1} of {rs.rounds.length}</div>
          <div className="font-display text-base font-bold capitalize text-white">
            {contract.name}
            {contract.noDiscard && <span className="ml-2 rounded bg-red-500/30 px-1.5 align-middle text-[9px] font-bold uppercase tracking-wider text-red-200">no discard</span>}
          </div>
        </div>
        <div className="text-right">
          <div className={`label ${myTurn ? '!text-gold' : ''}`}>{myTurn ? 'Your turn' : `${current?.name}'s turn`}</div>
          <Countdown deadline={view.phase === 'buy.window' ? bw?.deadline : view.turnDeadline} className="font-display text-xl font-bold" />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {/* The table */}
        <div className="px-2 pt-2">
          <Felt className="h-[330px]">
            {others.map((p, i) => (
              <div key={p.seat} className="absolute -translate-x-1/2 -translate-y-1/2" style={arcPosition(i, others.length)}>
                <Seat player={p} active={p.seat === view.currentSeat} isDealer={p.seat === view.dealerSeat} isMe={false} deadline={view.turnDeadline} totalSeconds={rs.turnTimerSeconds} compact wentOut={view.wentOutSeat === p.seat} />
              </div>
            ))}

            {/* Center: piles */}
            <div className="absolute left-1/2 top-[51%] flex -translate-x-1/2 -translate-y-1/2 items-end gap-5">
              <div className="flex flex-col items-center gap-1">
                <div className={canDraw && !busy ? 'rounded-lg ring-2 ring-gold/70 shadow-glow' : ''}>
                  <CardStack count={view.stockCount} disabled={!canDraw || busy} onClick={() => send({ type: 'DRAW_STOCK' })} />
                </div>
                <span className="rounded-full bg-black/40 px-2 text-[10px] font-semibold text-white/80">Stock · {view.stockCount}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <button type="button" disabled={!canDraw || !topDiscard || busy} onClick={() => send({ type: 'DRAW_DISCARD' })} className={`rounded-lg disabled:opacity-90 ${canDraw && topDiscard && !busy ? 'ring-2 ring-gold/70 shadow-glow' : ''}`}>
                  {topDiscard ? <CardView card={topDiscard} ruleSet={rs} /> : <div className="h-[86px] w-[60px] rounded-lg border border-dashed border-white/30" />}
                </button>
                <span className="rounded-full bg-black/40 px-2 text-[10px] font-semibold text-white/80">Discard · {view.discard.length}</span>
              </div>
            </div>

            {me && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
                <Seat player={me} active={myTurn} isDealer={me.seat === view.dealerSeat} isMe deadline={view.turnDeadline} totalSeconds={rs.turnTimerSeconds} compact wentOut={view.wentOutSeat === me.seat} />
              </div>
            )}
          </Felt>
        </div>

        {view.phase === 'buy.window' && bw ? (
          <div className="mx-3 mt-2 flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 animate-rise">
            <div>
              <div className="label !text-gold">Buy window · <Countdown deadline={bw.deadline} /></div>
              <div className="text-xs text-white/80">{status}</div>
            </div>
            {canBuy && (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" disabled={busy || iClaimed} onClick={() => send({ type: 'BUY' })}>
                  {iClaimed ? 'Claimed' : iHoldPriority ? 'Buy now' : 'Buy if free'}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => send({ type: 'PASS_BUY' })}>Pass</Button>
              </div>
            )}
          </div>
        ) : (
          <p className="px-4 pt-2 text-center text-xs text-white/60">{status}</p>
        )}

        {/* Melds */}
        <div className="px-3 pt-2">
          <div className="label mb-1.5">On the table</div>
          {view.melds.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/15 py-3 text-center text-xs text-white/40">No melds yet</p>
          ) : (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {view.melds.map((m) => (
                <MeldView key={m.id} meld={m} ruleSet={rs} ownerName={view.players[m.ownerSeat]?.name ?? ''} highlight={mode.kind === 'replace' && mode.meldId === m.id} onTap={canPlay ? () => tapMeld(m) : undefined} onTapCard={canPlay && me?.hasLaidDown ? (id) => tapMeldCard(m, id) : undefined} />
              ))}
            </div>
          )}
        </div>

        {groups.length > 0 && (
          <div className="mx-3 mt-2 rounded-xl border border-gold/40 bg-gold/10 p-2 animate-rise">
            <div className="mb-1 flex items-center justify-between">
              <span className="label !text-gold">Ready to lay down · {groups.length}/{contract.melds.length}</span>
              <button className="text-xs text-white/60 underline" onClick={() => setGroups([])}>clear</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {groups.map((g, gi) => (
                <button key={gi} className="flex rounded-lg bg-black/30 p-1" onClick={() => setGroups((x) => x.filter((_, i) => i !== gi))} title="Remove group">
                  {g.map((id) => handById.get(id)).filter((c): c is Card => Boolean(c)).map((c, i) => (
                    <div key={c.id} className="-ml-4 first:ml-0" style={{ zIndex: i }}>
                      <CardView card={c} ruleSet={rs} size="sm" />
                    </div>
                  ))}
                </button>
              ))}
            </div>
          </div>
        )}

        <details className="mx-3 my-2 text-xs text-white/40">
          <summary className="cursor-pointer">Table log</summary>
          <ul className="mt-1 space-y-0.5">
            {view.log.slice().reverse().map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </details>
      </main>

      {/* Hand tray */}
      <footer className="safe-bottom border-t border-line bg-[linear-gradient(180deg,#11161e_0%,#0b0e13_100%)]">
        <div className="flex items-center justify-between px-4 pt-2 text-[11px] text-white/60">
          <span>
            <span className="font-semibold text-white/80">Your hand</span> · {hand.length} cards · <span className="tabular-nums">{handScore(hand, rs)}</span> pts
          </span>
          {selected.size > 0 ? (
            <button onClick={clearSelection} className="text-gold underline">clear {selected.size}</button>
          ) : (
            me && <span>{me.buysLeft} buy{me.buysLeft === 1 ? '' : 's'} left</span>
          )}
        </div>
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pt-2">
          <span className="label mr-1 shrink-0">Arrange</span>
          <button className="shrink-0 rounded-lg border border-line bg-ink-4 px-2.5 py-1 text-xs font-semibold text-white/80 active:bg-ink-3" onClick={autoGroup}>✨ Group</button>
          <button className="shrink-0 rounded-lg border border-line bg-ink-4 px-2.5 py-1 text-xs font-semibold text-white/80 active:bg-ink-3" onClick={() => sortHand('suit')}>♠ Suit</button>
          <button className="shrink-0 rounded-lg border border-line bg-ink-4 px-2.5 py-1 text-xs font-semibold text-white/80 active:bg-ink-3" onClick={() => sortHand('rank')}>7 Rank</button>
          <span className="mx-1 h-5 w-px shrink-0 bg-line" />
          <button className="shrink-0 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-bold text-gold disabled:opacity-30" disabled={selected.size === 0} onClick={() => nudge(-1)} aria-label="Move selected left">◀ Move</button>
          <button className="shrink-0 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-bold text-gold disabled:opacity-30" disabled={selected.size === 0} onClick={() => nudge(1)} aria-label="Move selected right">Move ▶</button>
        </div>
        <Hand cards={unstagedHand} ruleSet={rs} selected={selected} onToggle={toggle} onReorder={onReorder} />
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-2">
          {canPlay && !me?.hasLaidDown && (
            <>
              <Button size="sm" variant="secondary" disabled={selected.size === 0 || busy} onClick={stageGroup}>Group ({selected.size})</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={autoArrange}>✨ Auto</Button>
              <Button size="sm" disabled={groups.length !== contract.melds.length || busy} onClick={layDown}>Lay down</Button>
            </>
          )}
          {canPlay && me?.hasLaidDown && rs.layOff !== 'never' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={autoLayOff}>✨ Auto lay off</Button>
          )}
          {canPlay && mode.kind === 'replace' && (
            <Button size="sm" variant="ghost" onClick={() => setMode({ kind: 'idle' })}>Cancel replace</Button>
          )}
          {canPlay && !contract.noDiscard && (
            <Button size="sm" variant="danger" disabled={selected.size !== 1 || busy} onClick={discard}>
              Discard {selectedCards.length === 1 ? cardLabel(selectedCards[0]) : ''}
            </Button>
          )}
          {canPlay && contract.noDiscard && (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => send({ type: 'END_TURN' })}>End turn</Button>
          )}
          {!myTurn && view.phase !== 'buy.window' && <span className="py-2 text-xs text-white/40">Waiting for {current?.name}…</span>}
        </div>
      </footer>
    </div>
  );
}
