// Card semantics for Swoop: values, special kinds, legality against the pile.
import type { Card } from '../cards.ts';
import type { Rank } from '../ruleset.ts';
import type { SwoopRuleSet } from './ruleset.ts';
import type { SwoopState } from './state.ts';

export type CardKind = 'clear' | 'reset' | 'normal';

export function cardKind(card: Card, rs: SwoopRuleSet): CardKind {
  if (card.rank === 'JOKER') return rs.jokersClear ? 'clear' : 'reset';
  if (rs.clearRanks.includes(card.rank)) return 'clear';
  if (rs.resetRanks.includes(card.rank)) return 'reset';
  return 'normal';
}

export function cardValue(card: Card, rs: SwoopRuleSet): number {
  if (card.rank === 'JOKER') return 15;
  if (card.rank === 'A') return rs.acesHigh ? 14 : 1;
  if (card.rank === 'J') return 11;
  if (card.rank === 'Q') return 12;
  if (card.rank === 'K') return 13;
  return Number(card.rank);
}

/** What the next play must satisfy. `open` means anything goes. */
export function pileConstraint(state: SwoopState, rs: SwoopRuleSet): { open: true } | { open: false; min?: number; max?: number } {
  const top = state.pile[state.pile.length - 1];
  if (!top) return { open: true };
  const kind = cardKind(top, rs);
  if (kind === 'reset') return { open: true };
  if (state.sevenActive) return { open: false, max: 7 };
  return { open: false, min: cardValue(top, rs) };
}

export function sameRank(cards: Card[]): boolean {
  return cards.length > 0 && cards.every((c) => c.rank === cards[0].rank);
}

/** Can these (same-rank) cards go on the pile right now? */
export function isLegalPlay(cards: Card[], state: SwoopState, rs: SwoopRuleSet): boolean {
  if (!sameRank(cards)) return false;
  const kind = cardKind(cards[0], rs);
  if (kind !== 'normal') return true;
  const c = pileConstraint(state, rs);
  if (c.open) return true;
  const v = cardValue(cards[0], rs);
  if (c.min !== undefined && v < c.min) return false;
  if (c.max !== undefined && v > c.max) return false;
  return true;
}

/** Ranks in `cards` that could legally be played now. */
export function legalRanks(cards: Card[], state: SwoopState, rs: SwoopRuleSet): Rank[] | ('JOKER' | Rank)[] {
  const ranks = [...new Set(cards.map((c) => c.rank))];
  return ranks.filter((r) => isLegalPlay([cards.find((c) => c.rank === r)!], state, rs));
}

/** Does the top of the pile now hold four of a kind? */
export function topIsFourOfAKind(pile: Card[]): boolean {
  if (pile.length < 4) return false;
  const last = pile.slice(-4);
  return last.every((c) => c.rank === last[0].rank);
}
