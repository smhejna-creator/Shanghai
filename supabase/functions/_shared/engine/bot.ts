// Bot strategy: pure functions from state to the action a bot would take. The
// server runs bots after every human action; nothing here touches I/O.
import { cardScore, isWild, rankValue, type Card } from './cards.ts';
import { layOffCards, type Meld } from './melds.ts';
import type { Contract, Rank, RuleSet } from './ruleset.ts';
import { findContractMelds, findLayOffs } from './solver.ts';
import type { Action, GameState } from './state.ts';

// ---------- hand evaluation ----------

/**
 * How close a hand is to the contract, as a score. Counts natural cards that
 * sit in partial sets (same rank) and partial runs (same suit, small gaps),
 * weighted by what the contract actually needs, plus wilds.
 */
export function handValue(hand: Card[], contract: Contract, rs: RuleSet): number {
  const setsNeeded = contract.melds.filter((m) => m.kind === 'set').length;
  const runsNeeded = contract.melds.filter((m) => m.kind === 'run').length;
  const setWeight = setsNeeded > 0 ? 1 : 0.35;
  const runWeight = runsNeeded > 0 ? 1 : 0.35;
  let score = 0;

  const naturals = hand.filter((c) => !isWild(c, rs));
  const wilds = hand.length - naturals.length;
  score += wilds * 3.5;

  // Sets: pairs are worth something, triples a lot, extras a little.
  const byRank = new Map<string, number>();
  for (const c of naturals) byRank.set(c.rank, (byRank.get(c.rank) ?? 0) + 1);
  for (const n of byRank.values()) {
    if (n >= 3) score += (6 + (n - 3) * 0.5) * setWeight;
    else if (n === 2) score += 2.5 * setWeight;
  }

  // Runs: best windows per suit, gaps of one allowed (a wild can fill them).
  for (const suit of ['S', 'H', 'D', 'C']) {
    const vals = [...new Set(naturals.filter((c) => c.suit === suit).map((c) => rankValue(c.rank as Rank, rs.acesHighLow === 'high' ? 14 : 1)))].sort((a, b) => a - b);
    let chain: number[] = [];
    const flush = () => {
      const n = chain.length;
      if (n >= 4) score += (6 + (n - 4) * 0.5) * runWeight;
      else if (n === 3) score += 3.5 * runWeight;
      else if (n === 2) score += 1.5 * runWeight;
      chain = [];
    };
    for (const v of vals) {
      if (chain.length && v - chain[chain.length - 1] > 2) flush();
      chain.push(v);
    }
    flush();
  }
  return score;
}

/** Points the card would cost if caught in hand, minus how much it helps the hand. */
function discardPenalty(card: Card, hand: Card[], contract: Contract, rs: RuleSet, tableMelds: Meld[]): number {
  const without = hand.filter((c) => c.id !== card.id);
  const loss = handValue(hand, contract, rs) - handValue(without, contract, rs);
  let penalty = loss * 4 - cardScore(card, rs) * 0.4;
  // Don't hand the next player a lay-off.
  if (tableMelds.some((m) => layOffCards(m, [card], rs).ok)) penalty += 6;
  if (isWild(card, rs)) penalty += 100;
  return penalty;
}

function gainFrom(card: Card, hand: Card[], contract: Contract, rs: RuleSet): number {
  return handValue([...hand, card], contract, rs) - handValue(hand, contract, rs);
}

function completesContract(card: Card, hand: Card[], contract: Contract, rs: RuleSet): boolean {
  if (findContractMelds(hand, contract, rs)) return false;
  return Boolean(findContractMelds([...hand, card], contract, rs));
}

// ---------- decisions ----------

export function wantsDiscard(top: Card, hand: Card[], contract: Contract, rs: RuleSet, laidDown: boolean, tableMelds: Meld[]): boolean {
  if (laidDown) {
    // Only useful if it can be laid off right away (keeping one card to discard).
    return hand.length > 1 && tableMelds.some((m) => layOffCards(m, [top], rs).ok);
  }
  if (isWild(top, rs)) return true;
  if (completesContract(top, hand, contract, rs)) return true;
  return gainFrom(top, hand, contract, rs) >= 3.5; // completes a triple / extends a run of 3+
}

export function wantsToBuy(top: Card, hand: Card[], contract: Contract, rs: RuleSet, buysLeft: number, penaltyCards: number): boolean {
  if (buysLeft <= 0) return false;
  if (isWild(top, rs)) return true;
  if (completesContract(top, hand, contract, rs)) return true;
  // Buying costs a penalty card per card taken; be pickier the more it costs.
  const threshold = 3.5 + penaltyCards * 0.75;
  return gainFrom(top, hand, contract, rs) >= threshold;
}

export function chooseDiscard(hand: Card[], contract: Contract, rs: RuleSet, tableMelds: Meld[]): Card {
  let best = hand[0];
  let bestPenalty = Infinity;
  for (const c of hand) {
    const p = discardPenalty(c, hand, contract, rs, tableMelds);
    if (p < bestPenalty) {
      bestPenalty = p;
      best = c;
    }
  }
  return best;
}

/**
 * Returns the next action a bot should take, or null when no bot needs to act.
 * Checks the buy-window priority holder first, then the current player.
 */
export function botAction(rs: RuleSet, state: GameState, now: number): Action | null {
  const contract = rs.rounds[state.roundIndex];
  if (state.phase === 'buy.window' && state.buyWindow) {
    const bw = state.buyWindow;
    const head = state.players[bw.order[bw.index]];
    if (head?.isBot) {
      const top = state.discard[state.discard.length - 1];
      const buy = top && wantsToBuy(top, head.hand, contract, rs, head.buysLeft, rs.buyPenaltyCards);
      return buy ? { type: 'BUY', userId: head.userId, now } : { type: 'PASS_BUY', userId: head.userId, now };
    }
  }
  const me = state.players[state.currentSeat];
  if (!me?.isBot) return null;

  if (state.phase === 'turn.draw' || state.phase === 'buy.window') {
    const top = state.discard[state.discard.length - 1];
    if (top && wantsDiscard(top, me.hand, contract, rs, me.hasLaidDown, state.melds)) return { type: 'DRAW_DISCARD', userId: me.userId, now };
    return { type: 'DRAW_STOCK', userId: me.userId, now };
  }

  if (state.phase === 'turn.play') {
    if (!me.hasLaidDown) {
      const groups = findContractMelds(me.hand, contract, rs);
      if (groups && (contract.noDiscard || groups.flat().length < me.hand.length)) {
        return { type: 'LAY_DOWN', userId: me.userId, melds: groups.map((g) => g.map((c) => c.id)), now };
      }
    } else if (rs.layOff !== 'never') {
      const plays = findLayOffs(me.hand, state.melds, rs, contract.noDiscard ? 0 : 1);
      if (plays.length > 0) return { type: 'LAY_OFF', userId: me.userId, meldId: plays[0].meldId, cardIds: plays[0].cardIds, now };
    }
    if (contract.noDiscard) return { type: 'END_TURN', userId: me.userId, now };
    if (me.hand.length === 0) return null;
    return { type: 'DISCARD', userId: me.userId, cardId: chooseDiscard(me.hand, contract, rs, state.melds).id, now };
  }
  return null;
}
