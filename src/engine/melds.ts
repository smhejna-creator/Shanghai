import type { Card, Suit } from './cards';
import { isWild, rankFromValue, rankValue } from './cards';
import type { Rank, RuleSet } from './ruleset';
import { MIN_RUN, MIN_SET } from './ruleset';

export interface SetMeld {
  id: string;
  ownerSeat: number;
  kind: 'set';
  rank: Rank;
  cards: Card[];
}

export interface RunMeld {
  id: string;
  ownerSeat: number;
  kind: 'run';
  suit: Suit;
  /** Value (1..14) of cards[0]. Ace is 1 or 14 depending on position. */
  lowValue: number;
  cards: Card[];
}

export type Meld = SetMeld | RunMeld;

export type MeldResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): MeldResult<T> => ({ ok: true, value });
const fail = <T>(error: string): MeldResult<T> => ({ ok: false, error });

/** Allowed value range for a run in this rule set. */
export function runBounds(rs: RuleSet): { lo: number; hi: number } {
  switch (rs.acesHighLow) {
    case 'low':
      return { lo: 1, hi: 13 };
    case 'high':
      return { lo: 2, hi: 14 };
    default:
      return { lo: 1, hi: 14 };
  }
}

function naturalMatches(rank: Rank, value: number): boolean {
  if (rank === 'A') return value === 1 || value === 14;
  return rankValue(rank) === value;
}

function tooManyWilds(cards: Card[], rs: RuleSet): boolean {
  const wilds = cards.filter((c) => isWild(c, rs)).length;
  return wilds > cards.length - wilds;
}

// ---------------- Sets ----------------

export function buildSet(cards: Card[], rs: RuleSet, minSize = MIN_SET): MeldResult<Omit<SetMeld, 'id' | 'ownerSeat'>> {
  if (cards.length < minSize) return fail(`A set needs at least ${minSize} cards`);
  const naturals = cards.filter((c) => !isWild(c, rs));
  if (naturals.length === 0) return fail('A set needs at least one natural card');
  const rank = naturals[0].rank as Rank;
  if (!naturals.every((c) => c.rank === rank)) return fail('All natural cards in a set must share a rank');
  if (tooManyWilds(cards, rs)) return fail('A set cannot have more wilds than natural cards');
  return ok({ kind: 'set', rank, cards: cards.slice() });
}

// ---------------- Runs ----------------

/** Validate an already-ordered run; returns its lowValue. */
export function validateRunOrder(cards: Card[], rs: RuleSet, minSize = MIN_RUN): MeldResult<{ suit: Suit; lowValue: number }> {
  if (cards.length < minSize) return fail(`A run needs at least ${minSize} cards`);
  if (cards.length > 13) return fail('A run cannot be longer than 13 cards');
  const naturals = cards.filter((c) => !isWild(c, rs));
  if (naturals.length === 0) return fail('A run needs at least one natural card');
  const suit = naturals[0].suit;
  if (!naturals.every((c) => c.suit === suit)) return fail('All natural cards in a run must share a suit');
  if (tooManyWilds(cards, rs)) return fail('A run cannot have more wilds than natural cards');
  for (let i = 1; i < cards.length; i++) {
    if (isWild(cards[i], rs) && isWild(cards[i - 1], rs)) return fail('Two wilds cannot be adjacent in a run');
  }
  const { lo, hi } = runBounds(rs);
  const i0 = cards.findIndex((c) => !isWild(c, rs));
  const first = cards[i0].rank as Rank;
  const candidates = first === 'A' ? (rs.acesHighLow === 'low' ? [1] : rs.acesHighLow === 'high' ? [14] : [1, 14]) : [rankValue(first)];
  for (const v0 of candidates) {
    const lowValue = v0 - i0;
    const highValue = lowValue + cards.length - 1;
    if (lowValue < lo || highValue > hi) continue;
    let valid = true;
    for (let p = 0; p < cards.length; p++) {
      const c = cards[p];
      if (isWild(c, rs)) continue;
      if (!naturalMatches(c.rank as Rank, lowValue + p)) {
        valid = false;
        break;
      }
    }
    if (valid) return ok({ suit, lowValue });
  }
  return fail('Cards do not form a consecutive run');
}

/** Try to order an unordered group of cards into a valid run. */
export function buildRun(cards: Card[], rs: RuleSet, minSize = MIN_RUN): MeldResult<Omit<RunMeld, 'id' | 'ownerSeat'>> {
  if (cards.length < minSize) return fail(`A run needs at least ${minSize} cards`);
  if (cards.length > 13) return fail('A run cannot be longer than 13 cards');
  const naturals = cards.filter((c) => !isWild(c, rs));
  const wilds = cards.filter((c) => isWild(c, rs));
  if (naturals.length === 0) return fail('A run needs at least one natural card');
  if (wilds.length > naturals.length) return fail('A run cannot have more wilds than natural cards');
  const suit = naturals[0].suit;
  if (!naturals.every((c) => c.suit === suit)) return fail('All natural cards in a run must share a suit');
  const { lo, hi } = runBounds(rs);
  const aceCandidates: (1 | 14)[] = rs.acesHighLow === 'low' ? [1] : rs.acesHighLow === 'high' ? [14] : [1, 14];

  for (const aceValue of aceCandidates) {
    const sorted = naturals
      .map((c) => ({ c, v: rankValue(c.rank as Rank, aceValue) }))
      .sort((a, b) => a.v - b.v);
    let dup = false;
    for (let i = 1; i < sorted.length; i++) if (sorted[i].v === sorted[i - 1].v) dup = true;
    if (dup) continue;
    // Fill gaps with wilds.
    const ordered: Card[] = [];
    let remaining = wilds.slice();
    let failed = false;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0) {
        const gap = sorted[i].v - sorted[i - 1].v - 1;
        if (gap > 1) {
          failed = true; // would need adjacent wilds
          break;
        }
        if (gap === 1) {
          if (remaining.length === 0) {
            failed = true;
            break;
          }
          ordered.push(remaining.shift()!);
        }
      }
      ordered.push(sorted[i].c);
    }
    if (failed) continue;
    let lowValue = sorted[0].v;
    let highValue = sorted[sorted.length - 1].v;
    // Leftover wilds go on the ends: high first, then low, at most one on each end.
    let endHigh = false;
    let endLow = false;
    while (remaining.length > 0) {
      if (!endHigh && highValue + 1 <= hi && highValue - lowValue + 1 < 13) {
        ordered.push(remaining.shift()!);
        highValue++;
        endHigh = true;
      } else if (!endLow && lowValue - 1 >= lo && highValue - lowValue + 1 < 13) {
        ordered.unshift(remaining.shift()!);
        lowValue--;
        endLow = true;
      } else {
        failed = true;
        break;
      }
    }
    if (failed) continue;
    if (lowValue < lo || highValue > hi) continue;
    const check = validateRunOrder(ordered, rs, minSize);
    if (check.ok) return ok({ kind: 'run', suit, lowValue: check.value.lowValue, cards: ordered });
  }
  return fail('Cards do not form a consecutive run');
}

/** For UI: what each card in a run stands for. */
export function runCardValue(meld: RunMeld, index: number): { rank: Rank; suit: Suit } {
  return { rank: rankFromValue(meld.lowValue + index), suit: meld.suit };
}

// ---------------- Lay off ----------------

export function layOffCards(meld: Meld, cards: Card[], rs: RuleSet): MeldResult<Meld> {
  if (cards.length === 0) return fail('No cards to lay off');
  if (meld.kind === 'set') {
    for (const c of cards) {
      if (!isWild(c, rs) && c.rank !== meld.rank) return fail(`Only ${meld.rank}s or wilds can be added to this set`);
    }
    const all = [...meld.cards, ...cards];
    if (tooManyWilds(all, rs)) return fail('A set cannot have more wilds than natural cards');
    return ok({ ...meld, cards: all });
  }
  // Run: attach naturals first, then wilds, only at the ends.
  const { lo, hi } = runBounds(rs);
  let ordered = meld.cards.slice();
  let lowValue = meld.lowValue;
  const pending = cards.slice().sort((a, b) => Number(isWild(a, rs)) - Number(isWild(b, rs)));
  while (pending.length > 0) {
    const highValue = lowValue + ordered.length - 1;
    const canGrow = ordered.length < 13;
    let placed = false;
    for (let i = 0; i < pending.length; i++) {
      const c = pending[i];
      if (!canGrow) break;
      if (isWild(c, rs)) {
        if (highValue + 1 <= hi && !isWild(ordered[ordered.length - 1], rs)) {
          ordered.push(c);
          placed = true;
        } else if (lowValue - 1 >= lo && !isWild(ordered[0], rs)) {
          ordered.unshift(c);
          lowValue--;
          placed = true;
        }
      } else {
        if (c.suit !== meld.suit) return fail('Card does not match the run suit');
        if (highValue + 1 <= hi && naturalMatches(c.rank as Rank, highValue + 1)) {
          ordered.push(c);
          placed = true;
        } else if (lowValue - 1 >= lo && naturalMatches(c.rank as Rank, lowValue - 1)) {
          ordered.unshift(c);
          lowValue--;
          placed = true;
        }
      }
      if (placed) {
        pending.splice(i, 1);
        break;
      }
    }
    if (!placed) return fail('Card cannot be added to either end of this run');
  }
  if (tooManyWilds(ordered, rs)) return fail('A run cannot have more wilds than natural cards');
  const check = validateRunOrder(ordered, rs, 1);
  if (!check.ok) return fail(check.error);
  return ok({ ...meld, cards: ordered, lowValue });
}

// ---------------- Wild replacement ----------------

export function replaceWildInRun(meld: Meld, wildCardId: string, natural: Card, rs: RuleSet): MeldResult<{ meld: RunMeld; wild: Card }> {
  if (meld.kind !== 'run') return fail('Wilds can only be replaced in runs');
  const idx = meld.cards.findIndex((c) => c.id === wildCardId);
  if (idx < 0) return fail('That wild is not in this run');
  const wild = meld.cards[idx];
  if (!isWild(wild, rs)) return fail('That card is not a wild');
  if (isWild(natural, rs)) return fail('A wild cannot replace a wild');
  const value = meld.lowValue + idx;
  if (natural.suit !== meld.suit || !naturalMatches(natural.rank as Rank, value))
    return fail(`That wild stands for the ${rankFromValue(value)} of this suit`);
  const cards = meld.cards.slice();
  cards[idx] = natural;
  return ok({ meld: { ...meld, cards }, wild });
}
