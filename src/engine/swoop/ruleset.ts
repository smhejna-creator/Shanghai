// Swoop (Palace-family shedding game). Every rule lives here.
import type { Rank } from '../ruleset.ts';
import { RANKS } from '../ruleset.ts';

export interface SwoopRuleSet {
  version: 1;
  game: 'swoop';
  name: string;
  players: { min: number; max: number };
  decks: number;
  jokersPerDeck: number;
  faceDown: number;
  faceUp: number;
  handSize: number;
  /** Draw back up to this many cards after playing from hand (while the stock lasts). */
  refillTo: number;
  /** Ranks (plus jokers) that can be played on anything and clear the pile: the "swoop". */
  clearRanks: Rank[];
  jokersClear: boolean;
  /** Ranks that can be played on anything and reset the pile so anything can follow. */
  resetRanks: Rank[];
  fourOfAKindClears: boolean;
  /** After clearing the pile, does the same player go again? */
  afterClear: 'playAgain' | 'nextPlayer';
  /** Playing a 7 forces the next card to be 7 or lower. */
  sevenLower: boolean;
  acesHigh: boolean;
  /** Players may swap hand cards with their face-up cards before the first play. */
  swapPhase: boolean;
  /** May a player pick up the pile even when they have a legal play? */
  voluntaryPickup: boolean;
  /** Hands per game; standings are the sum of finishing positions (lowest wins). */
  rounds: number;
  turnTimerSeconds: number;
  swapTimerSeconds: number;
}

export function swoopDefault(): SwoopRuleSet {
  return {
    version: 1,
    game: 'swoop',
    name: 'House Swoop',
    players: { min: 2, max: 6 },
    decks: 1,
    jokersPerDeck: 2,
    faceDown: 4,
    faceUp: 4,
    handSize: 7,
    refillTo: 7,
    clearRanks: ['10'],
    jokersClear: true,
    resetRanks: ['2'],
    fourOfAKindClears: true,
    afterClear: 'playAgain',
    sevenLower: false,
    acesHigh: true,
    swapPhase: true,
    voluntaryPickup: false,
    rounds: 1,
    turnTimerSeconds: 60,
    swapTimerSeconds: 90,
  };
}

export function swoopClassic(): SwoopRuleSet {
  return { ...swoopDefault(), name: 'Classic 3-3-3', faceDown: 3, faceUp: 3, handSize: 3, refillTo: 3, jokersPerDeck: 0, jokersClear: false };
}

export const SWOOP_PRESETS: { key: string; label: string; build: () => SwoopRuleSet }[] = [
  { key: 'house', label: 'House Swoop', build: swoopDefault },
  { key: 'classic', label: 'Classic 3-3-3', build: swoopClassic },
];

/** Cards dealt per player. */
export function cardsPerPlayer(rs: SwoopRuleSet): number {
  return rs.faceDown + rs.faceUp + rs.handSize;
}

/** Decks needed so everyone can be dealt plus a stock of at least 10 cards. */
export function suggestedSwoopDecks(rs: SwoopRuleSet, players: number): number {
  const perDeck = 52 + rs.jokersPerDeck;
  return Math.max(1, Math.ceil((players * cardsPerPlayer(rs) + 10) / perDeck));
}

export function validateSwoopRuleSet(rs: SwoopRuleSet): string[] {
  const e: string[] = [];
  if (rs.game !== 'swoop' || rs.version !== 1) e.push('Not a Swoop rule set');
  if (!rs.name?.trim()) e.push('Rule set needs a name');
  if (rs.players.min < 2 || rs.players.max > 6 || rs.players.min > rs.players.max) e.push('Players must be between 2 and 6');
  if (!Number.isInteger(rs.decks) || rs.decks < 1 || rs.decks > 4) e.push('Decks must be 1–4');
  if (!Number.isInteger(rs.jokersPerDeck) || rs.jokersPerDeck < 0 || rs.jokersPerDeck > 4) e.push('Jokers per deck must be 0–4');
  for (const [k, v] of [['Face-down cards', rs.faceDown], ['Face-up cards', rs.faceUp], ['Hand size', rs.handSize]] as const)
    if (!Number.isInteger(v) || v < 0 || v > 8) e.push(`${k} must be 0–8`);
  if (rs.faceDown + rs.faceUp + rs.handSize < 3) e.push('Deal at least 3 cards per player');
  if (!Number.isInteger(rs.refillTo) || rs.refillTo < 0 || rs.refillTo > 12) e.push('Refill size must be 0–12');
  for (const r of [...rs.clearRanks, ...rs.resetRanks]) if (!RANKS.includes(r)) e.push(`Unknown rank ${r}`);
  if (rs.clearRanks.some((r) => rs.resetRanks.includes(r))) e.push('A rank cannot both clear and reset');
  if (!Number.isInteger(rs.rounds) || rs.rounds < 1 || rs.rounds > 20) e.push('Rounds must be 1–20');
  if (rs.turnTimerSeconds !== 0 && (rs.turnTimerSeconds < 10 || rs.turnTimerSeconds > 600)) e.push('Turn timer must be 0 (off) or 10–600 seconds');
  if (rs.swapTimerSeconds !== 0 && (rs.swapTimerSeconds < 10 || rs.swapTimerSeconds > 600)) e.push('Swap timer must be 0 (off) or 10–600 seconds');
  // The actual player count is checked when dealing; here just make sure the minimum table fits.
  const total = rs.decks * (52 + rs.jokersPerDeck);
  if (rs.players.min * cardsPerPlayer(rs) + 1 > total) e.push(`Not enough cards for ${rs.players.min} players; add a deck or deal fewer cards`);
  return e;
}
