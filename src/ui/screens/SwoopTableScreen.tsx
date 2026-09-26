import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Card } from '@/engine/index.ts';
import { cardKind, cardLabel, isLegalPlay, legalRanks, pileConstraint } from '@/engine/index.ts';
import type { GameData } from '@/lib/supabase/useGame';
import { api } from '@/lib/supabase/api';
import { Button } from '../components/Button';
import { CardStack, CardView } from '../components/CardView';
import { Countdown } from '../components/Countdown';
import { Felt, seatPosition, useIsDesktop } from '../components/Felt';
import { Hand } from '../components/Hand';
import { Logo } from '../components/Logo';
import { SwoopSeat } from '../components/SwoopSeat';

type SwoopGame = Extract<GameData, { gameType: 'swoop' }>;

export function SwoopTableScreen({ game, gameId, user, onError }: { game: SwoopGame; gameId: string; user: User; onError: (m: string) => void }) {
  const { view, ruleSet: rs } = game;
  const desktop = useIsDesktop();
  const me = view.players.find((p) => p.userId === user.id);
  const mySeat = me?.seat ?? -1;
  const myTurn = view.phase === 'turn' && view.currentSeat === mySeat && me?.finished === undefined;
  const swapping = view.phase === 'swap' && me && !me.doneSwapping;
  const [selHand, setSelHand] = useState<Set<string>>(new Set());
  const [selUp, setSelUp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hand = view.myHand;
  const handById = useMemo(() => new Map(hand.map((c) => [c.id, c])), [hand]);
  const [order, setOrder] = useState<string[]>(() => hand.map((c) => c.id));
  useEffect(() => {
    setOrder((prev) => {
      const kept = prev.filter((id) => handById.has(id));
      const added = hand.map((c) => c.id).filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
    });
    setSelHand((s) => new Set([...s].filter((id) => handById.has(id))));
  }, [hand, handById]);
  useEffect(() => {
    if (!myTurn && !swapping) {
      setSelHand(new Set());
      setSelUp(null);
    }
  }, [myTurn, swapping]);
  const orderedHand = useMemo(() => order.map((id) => handById.get(id)).filter((c): c is Card => Boolean(c)), [order, handById]);

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

  // Rule helpers work on the public view (pile and sevenActive are public).
  const stateLike = { pile: view.pile, sevenActive: view.sevenActive } as never;
  const source: 'hand' | 'faceUp' | 'faceDown' | 'none' = hand.length ? 'hand' : me?.faceUp.length ? 'faceUp' : me && me.faceDownCount > 0 ? 'faceDown' : 'none';
  const pool = source === 'hand' ? hand : source === 'faceUp' ? me?.faceUp ?? [] : [];
  const legal = myTurn ? legalRanks(pool, stateLike, rs) : [];
  const selectedCards = source === 'hand' ? hand.filter((c) => selHand.has(c.id)) : (me?.faceUp ?? []).filter((c) => c.id === selUp || selHand.has(c.id));
  const selectionLegal = selectedCards.length > 0 && isLegalPlay(selectedCards, stateLike, rs);
  const canPickUp = myTurn && view.pileCount > 0 && source !== 'faceDown' && (rs.voluntaryPickup || legal.length === 0);

  const toggleHand = (id: string) => {
    const card = handById.get(id);
    if (!card) return;
    if (swapping) {
      setSelHand((s) => (s.has(id) ? new Set() : new Set([id])));
      return;
    }
    if (!myTurn || source !== 'hand') return;
    setSelHand((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else {
        // Keep selections to one rank.
        for (const other of n) if (handById.get(other)?.rank !== card.rank) n.delete(other);
        n.add(id);
      }
      return n;
    });
  };
  const tapFaceUp = (card: Card) => {
    if (swapping) {
      setSelUp((u) => (u === card.id ? null : card.id));
      return;
    }
    if (!myTurn || source !== 'faceUp') return;
    setSelHand((s) => {
      const n = new Set(s);
      if (n.has(card.id)) n.delete(card.id);
      else {
        for (const other of n) if (me?.faceUp.find((c) => c.id === other)?.rank !== card.rank) n.delete(other);
        n.add(card.id);
      }
      return n;
    });
  };
  const tapFaceDown = (index: number) => {
    if (!myTurn || source !== 'faceDown') return;
    send({ type: 'PLAY_BLIND', index });
  };
  const play = () => send({ type: 'PLAY', cardIds: selectedCards.map((c) => c.id) }, () => { setSelHand(new Set()); setSelUp(null); });
  const swap = () => {
    const h = [...selHand][0];
    if (!h || !selUp) return;
    send({ type: 'SWAP', handCardId: h, faceUpCardId: selUp }, () => { setSelHand(new Set()); setSelUp(null); });
  };
  const onReorder = (ids: string[]) => {
    setOrder(ids);
    api.action(gameId, { type: 'REORDER_HAND', cardIds: ids }).catch(() => {});
  };

  const others = view.players.filter((p) => p.seat !== mySeat);
  const current = view.players[view.currentSeat];
  const constraint = pileConstraint(stateLike, rs);
  const pileHint = view.pileCount === 0 ? 'Empty pile: anything goes' : constraint.open ? 'Reset: anything goes' : constraint.max !== undefined ? `Play ${constraint.max} or lower` : `Play ${view.pileTop?.rank === 'A' ? 'an Ace' : view.pileTop?.rank} or higher`;
  const specials = [...rs.clearRanks.map((r) => `${r} swoops`), ...(rs.jokersClear ? ['Joker swoops'] : ['Joker resets']), ...rs.resetRanks.map((r) => `${r} resets`)].join(' · ');

  const status = (() => {
    if (view.phase === 'swap') return swapping ? 'Swap: tap one hand card and one face-up card, then Swap. Strong cards face up help at the end.' : `Waiting for ${view.players.filter((p) => !p.doneSwapping).map((p) => p.name).join(', ')} to finish swapping…`;
    if (me?.finished !== undefined) return `You're out (${['1st', '2nd', '3rd', '4th', '5th', '6th'][me.finished]}). Watching the rest play.`;
    if (!myTurn) return `${current?.name} is playing…`;
    if (source === 'faceDown') return 'Hand and face-up cards gone: tap a face-down card to flip it blind.';
    if (source === 'faceUp') return legal.length ? 'Play from your face-up cards.' : 'No face-up card fits: pick up the pile.';
    if (legal.length === 0) return 'Nothing in your hand fits. Pick up the pile.';
    return `${pileHint}. Select cards of one rank and play.`;
  })();

  const cardSize = desktop ? 'lg' : 'md';
  const myArea = me && (
    <div className="flex items-end justify-center gap-4 px-3">
      {me.faceDownCount > 0 && (
        <div className="flex flex-col items-center gap-1">
          <div className="flex">
            {Array.from({ length: me.faceDownCount }, (_, i) => (
              <button key={i} type="button" onClick={() => tapFaceDown(i)} disabled={!myTurn || source !== 'faceDown' || busy} className={`-ml-3 first:ml-0 rounded-md transition ${myTurn && source === 'faceDown' ? 'cursor-pointer ring-2 ring-gold/70 shadow-glow hover:-translate-y-1' : ''}`} style={{ zIndex: i }}>
                <CardView card={{ id: `fd${i}`, rank: 'A', suit: 'S', deck: 0 }} ruleSet={rs} faceDown size="sm" />
              </button>
            ))}
          </div>
          <span className="label">Face down</span>
        </div>
      )}
      {me.faceUp.length > 0 && (
        <div className="flex flex-col items-center gap-1">
          <div className="flex">
            {me.faceUp.map((c, i) => (
              <div key={c.id} className="-ml-3 first:ml-0" style={{ zIndex: i }}>
                <CardView card={c} ruleSet={rs} size="sm" selected={selUp === c.id || selHand.has(c.id)} onClick={() => tapFaceUp(c)} dim={myTurn && source === 'faceUp' && !legal.includes(c.rank)} />
              </div>
            ))}
          </div>
          <span className="label">Face up</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="safe-top flex items-center justify-between border-b border-line bg-ink-2/80 px-3 py-2 backdrop-blur lg:px-6">
        <div className="hidden lg:block"><Logo size="sm" className="!items-start" title="SWOOP" subtitle="Card Room" /></div>
        <div className="lg:text-center">
          <div className="label">Swoop · hand {view.roundIndex + 1} of {rs.rounds}</div>
          <div className="font-display text-base font-bold text-white lg:text-xl">{view.phase === 'swap' ? 'Swap phase' : pileHint}</div>
        </div>
        <div className="text-right">
          <div className={`label ${myTurn ? '!text-gold' : ''}`}>{view.phase === 'swap' ? 'Swapping' : myTurn ? 'Your turn' : `${current?.name}'s turn`}</div>
          <Countdown deadline={view.turnDeadline} className="font-display text-xl font-bold lg:text-2xl" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="min-h-0 flex-1 overflow-y-auto lg:flex lg:flex-col lg:overflow-hidden">
          <div className="px-2 pt-2 lg:flex lg:flex-1 lg:items-center lg:justify-center lg:px-8 lg:py-4">
            <Felt className="h-[340px] lg:h-[min(58vh,600px)] lg:max-w-[1100px]">
              {others.map((p, i) => (
                <div key={p.seat} className="absolute -translate-x-1/2 -translate-y-1/2" style={seatPosition(i, others.length, desktop ? 'ring' : 'arc')}>
                  <SwoopSeat player={p} ruleSet={rs} active={view.phase === 'turn' && p.seat === view.currentSeat} isDealer={p.seat === view.dealerSeat} isMe={false} deadline={view.turnDeadline} totalSeconds={view.phase === 'swap' ? rs.swapTimerSeconds : rs.turnTimerSeconds} compact={!desktop} />
                </div>
              ))}
              <div className="absolute left-1/2 top-[50%] flex -translate-x-1/2 -translate-y-1/2 items-end gap-6 lg:gap-8">
                <div className="flex flex-col items-center gap-1">
                  <CardStack count={view.stockCount} size={cardSize} disabled />
                  <span className="rounded-full bg-black/40 px-2 text-[10px] font-semibold text-white/80 lg:text-xs">Stock · {view.stockCount}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="relative">
                    {view.pileCount > 1 && <div className={`card-face absolute -left-1 -top-1 ${desktop ? 'h-[108px] w-[76px] rounded-xl' : 'h-[86px] w-[60px] rounded-lg'} opacity-60`} />}
                    {view.pileTop ? <CardView card={view.pileTop} ruleSet={rs} size={cardSize} className="relative" /> : <div className={`rounded-lg border border-dashed border-white/30 ${desktop ? 'h-[108px] w-[76px]' : 'h-[86px] w-[60px]'}`} />}
                  </div>
                  <span className="rounded-full bg-black/40 px-2 text-[10px] font-semibold text-white/80 lg:text-xs">Pile · {view.pileCount}</span>
                </div>
              </div>
              {me && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 lg:bottom-3">
                  <SwoopSeat player={me} ruleSet={rs} active={myTurn} isDealer={me.seat === view.dealerSeat} isMe deadline={view.turnDeadline} totalSeconds={view.phase === 'swap' ? rs.swapTimerSeconds : rs.turnTimerSeconds} compact={!desktop} />
                </div>
              )}
            </Felt>
          </div>
          <div className="mx-3 mt-2 lg:mx-8 lg:mt-0">
            {(myTurn || swapping) ? (
              <div className="flex items-center justify-center gap-3 rounded-xl border border-gold/50 bg-gold/15 px-3 py-2 animate-rise">
                <span className="label !text-gold">{swapping ? 'Swap' : 'Your turn'}</span>
                <span className="text-sm text-white/90">{status}</span>
              </div>
            ) : (
              <p className="py-1 text-center text-xs text-white/60 lg:text-sm">{status}</p>
            )}
          </div>
          <div className="lg:hidden">
            <details className="mx-3 my-2 text-xs text-white/40">
              <summary className="cursor-pointer">Table log · {specials}</summary>
              <ul className="mt-1 space-y-0.5">{view.log.slice().reverse().map((l, i) => <li key={i}>{l}</li>)}</ul>
            </details>
          </div>
        </main>
        <aside className="hidden w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-ink-2/60 p-4 lg:flex">
          <div className="label">House rules</div>
          <ul className="text-xs text-white/70">
            <li>Play equal or higher, one rank at a time.</li>
            <li>{specials}.</li>
            {rs.fourOfAKindClears && <li>Four of a kind clears the pile.</li>}
            {rs.sevenLower && <li>After a 7, play 7 or lower.</li>}
            <li>Can't play? Pick up the pile.</li>
            <li>Hand first, then face-up, then face-down blind.</li>
          </ul>
          <div className="label mt-2">Table log</div>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto text-xs text-white/60">{view.log.slice().reverse().map((l, i) => <li key={i}>{l}</li>)}</ul>
        </aside>
      </div>

      <footer className="safe-bottom border-t border-line bg-[linear-gradient(180deg,#11161e_0%,#0b0e13_100%)]">
        <div className="mx-auto max-w-[1400px]">
          <div className="pt-2">{myArea}</div>
          <div className="flex items-center justify-between px-4 pt-2 text-[11px] text-white/60 lg:px-8 lg:text-sm">
            <span><span className="font-semibold text-white/80">Your hand</span> · {hand.length} cards</span>
            {selHand.size > 0 && <button onClick={() => setSelHand(new Set())} className="text-gold underline">clear</button>}
          </div>
          <Hand cards={orderedHand} ruleSet={rs} selected={selHand} onToggle={toggleHand} onReorder={onReorder} size={cardSize} />
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-3 lg:justify-center">
            {swapping && (
              <>
                <Button size="sm" disabled={busy || selHand.size !== 1 || !selUp} onClick={swap}>⇅ Swap</Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => send({ type: 'DONE_SWAPPING' })}>Done swapping</Button>
              </>
            )}
            {myTurn && source !== 'faceDown' && (
              <>
                <Button size="sm" disabled={busy || !selectionLegal} onClick={play}>
                  Play {selectedCards.length > 0 ? `${selectedCards.length > 1 ? `${selectedCards.length}× ` : ''}${cardLabel(selectedCards[0])}` : ''}
                  {selectedCards.length > 0 && cardKind(selectedCards[0], rs) === 'clear' ? ' · swoop!' : ''}
                </Button>
                <Button size="sm" variant="danger" disabled={busy || !canPickUp} onClick={() => send({ type: 'PICK_UP' })}>Pick up pile ({view.pileCount})</Button>
              </>
            )}
            {!myTurn && !swapping && view.phase === 'turn' && <span className="py-2 text-xs text-white/40">Waiting for {current?.name}…</span>}
          </div>
        </div>
      </footer>
    </div>
  );
}
