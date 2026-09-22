import type { Card, Suit } from '../cards.ts';
import type { Contract, MeldRequirement, RuleSet } from '../ruleset.ts';
import { classic2sWild, contractName, houseDefault } from '../ruleset.ts';
import { createGame, reduce } from '../reducer.ts';
import type { Action, GameState, PlayerState } from '../state.ts';

let counter = 0;
/** c('7H'), c('10S'), c('AD'), c('JOKER'). Ids are unique per call. */
export function c(spec: string): Card {
  counter++;
  if (spec === 'JOKER' || spec === 'J*') return { id: `JOKER-t${counter}`, rank: 'JOKER', suit: 'X', deck: 0 };
  const suit = spec.slice(-1) as Suit;
  const rank = spec.slice(0, -1) as Card['rank'];
  return { id: `${rank}${suit}-t${counter}`, rank, suit, deck: 0 };
}
export const cs = (...specs: string[]) => specs.map(c);

export function customRules(): RuleSet {
  const set = (size: number): MeldRequirement => ({ kind: 'set', size });
  const run = (size: number): MeldRequirement => ({ kind: 'run', size });
  const rounds: Contract[] = [
    { id: 'c1', name: contractName([set(4), set(4)]), melds: [set(4), set(4)], noDiscard: false },
    { id: 'c2', name: contractName([run(5)]), melds: [run(5)], noDiscard: false },
    { id: 'c3', name: contractName([set(3), run(4), run(4)]), melds: [set(3), run(4), run(4)], noDiscard: true },
  ];
  return {
    ...houseDefault(),
    name: 'Custom test rules',
    decks: 3,
    wilds: { jokers: true, ranks: ['2', '10'] },
    rounds,
    cardsPerRound: 12,
    buysPerRound: 1,
    buyPenaltyCards: 2,
    acesHighLow: 'high',
    turnTimerSeconds: 30,
  };
}

export const RULESETS: [string, RuleSet][] = [
  ['house default (jokers+10s, aces either, 3 buys)', houseDefault()],
  ['classic 2s wild (aces low, 2 buys)', classic2sWild()],
  ['custom contracts (3 decks, 12 cards, 1 buy)', customRules()],
];

export const NOW = 1_700_000_000_000;

export function player(seat: number, hand: Card[] = [], extra: Partial<PlayerState> = {}): PlayerState {
  return {
    seat,
    userId: `u${seat}`,
    name: `P${seat}`,
    hand,
    buysLeft: 3,
    hasLaidDown: false,
    scores: [],
    ready: true,
    connected: true,
    ...extra,
  };
}

/** A game in progress. Seat 0 is current, in `turn.play` by default. */
export function playing(
  rs: RuleSet,
  hands: Card[][],
  opts: Partial<GameState> & { buysLeft?: number } = {},
): GameState {
  const base = createGame('u0', 'seed');
  const { buysLeft, ...rest } = opts;
  return {
    ...base,
    phase: 'turn.play',
    roundIndex: 0,
    dealerSeat: hands.length - 1,
    currentSeat: 0,
    players: hands.map((h, i) => player(i, h, { buysLeft: buysLeft ?? rs.buysPerRound })),
    stock: cs('3C', '4C', '5C', '6C', '7C', '8C', '9C', 'JC', 'QC', 'KC'),
    discard: cs('5D'),
    turnDeadline: NOW + rs.turnTimerSeconds * 1000,
    ...rest,
  };
}

export function ok(rs: RuleSet, state: GameState, action: Action): GameState {
  const r = reduce(rs, state, action);
  if (!r.ok) throw new Error(`Expected ok, got ${r.error.code}: ${r.error.message}`);
  return r.state;
}

export function fail(rs: RuleSet, state: GameState, action: Action): string {
  const r = reduce(rs, state, action);
  if (r.ok) throw new Error(`Expected error, action ${action.type} succeeded`);
  return r.error.code;
}

export const ids = (cards: Card[]) => cards.map((x) => x.id);

/** Build a lobby with n ready players and start the game. */
export function startedGame(rs: RuleSet, n: number, seed = 'seed'): GameState {
  let s = createGame('u0', seed);
  for (let i = 0; i < n; i++) s = ok(rs, s, { type: 'JOIN', userId: `u${i}`, name: `P${i}` });
  for (let i = 1; i < n; i++) s = ok(rs, s, { type: 'READY', userId: `u${i}`, ready: true });
  return ok(rs, s, { type: 'START', userId: 'u0', now: NOW });
}
