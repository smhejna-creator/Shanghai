import type { Rank, RuleSet } from './ruleset.ts';
import { RANKS } from './ruleset.ts';

export type Suit = 'S' | 'H' | 'D' | 'C' | 'X';
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export interface Card {
  id: string;
  rank: Rank | 'JOKER';
  suit: Suit;
  deck: number;
}

export function isJoker(c: Card): boolean {
  return c.rank === 'JOKER';
}

export function isWild(c: Card, rs: RuleSet): boolean {
  if (c.rank === 'JOKER') return rs.wilds.jokers;
  return rs.wilds.ranks.includes(c.rank);
}

/** Natural rank value with ace treated as `aceValue` (1 or 14). */
export function rankValue(rank: Rank, aceValue: 1 | 14 = 1): number {
  if (rank === 'A') return aceValue;
  return RANKS.indexOf(rank) + 1;
}

export function rankFromValue(v: number): Rank {
  if (v === 1 || v === 14) return 'A';
  return RANKS[v - 1];
}

export function cardScore(c: Card, rs: RuleSet): number {
  if (c.rank === 'JOKER') return rs.scoring.joker;
  if (rs.wilds.ranks.includes(c.rank)) return rs.scoring.wildRank;
  if (c.rank === 'A') return rs.scoring.ace;
  if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') return rs.scoring.faceCards;
  return rankValue(c.rank);
}

export function handScore(cards: Card[], rs: RuleSet): number {
  return cards.reduce((sum, c) => sum + cardScore(c, rs), 0);
}

export function buildDeck(rs: RuleSet): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < rs.decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ id: `${rank}${suit}-${d}`, rank, suit, deck: d });
    }
    for (let j = 0; j < rs.jokersPerDeck; j++) cards.push({ id: `JOKER-${d}-${j}`, rank: 'JOKER', suit: 'X', deck: d });
  }
  return cards;
}

// ---- Seeded RNG (mulberry32 over a string hash) ----
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function rng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], seed: string): T[] {
  const out = items.slice();
  const next = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function cardLabel(c: Card): string {
  if (c.rank === 'JOKER') return 'Joker';
  const suit = { S: '♠', H: '♥', D: '♦', C: '♣', X: '' }[c.suit];
  return `${c.rank}${suit}`;
}
