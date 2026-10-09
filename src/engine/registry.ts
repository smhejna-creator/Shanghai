// One entry point per game so the server and client stay generic.
import type { Card } from './cards.ts';
import { createGame, reduce } from './reducer.ts';
import { botAction } from './bot.ts';
import { validateRuleSet, houseDefault, classic2sWild } from './ruleset.ts';
import { toPublicState } from './view.ts';
import type { GameState } from './state.ts';
import type { PublicState } from './view.ts';
import { createSwoopGame, reduceSwoop, swoopBotAction, validateSwoopRuleSet, toSwoopPublicState, swoopDefault, swoopClassic } from './swoop/index.ts';
import type { SwoopState, SwoopPublicState } from './swoop/index.ts';

export type GameType = 'shanghai' | 'swoop';
export const GAME_TYPES: GameType[] = ['shanghai', 'swoop'];

export interface HandRow {
  seat: number;
  userId: string;
  cards: Card[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface GameModule {
  type: GameType;
  title: string;
  tagline: string;
  validateRuleSet(rs: any): string[];
  defaultRuleSet(): any;
  presets: { key: string; label: string; build: () => any }[];
  createGame(hostUserId: string, seed: string): any;
  reduce(rs: any, state: any, action: any): { ok: true; state: any; ruleSet: any } | { ok: false; error: { code: string; message: string } };
  botAction(rs: any, state: any, now: number): any | null;
  toPublicState(state: any): any;
  /** Split a full state into what goes in game_hands (per seat, visible to that seat) and game_secrets (nobody). */
  split(state: any): { hands: HandRow[]; secret: any };
  /** Rebuild the full state from the stored parts. */
  merge(pub: any, hands: HandRow[], secret: any): any;
  statusOf(state: any): 'lobby' | 'playing' | 'finished';
  deadlineOf(state: any): number | null;
  players(state: any): { seat: number; userId: string; name: string; ready: boolean; connected: boolean; isBot?: boolean }[];
}

const shanghai: GameModule = {
  type: 'shanghai',
  title: 'Shanghai',
  tagline: 'Contract rummy. Seven rounds of sets and runs; lowest score wins.',
  validateRuleSet,
  defaultRuleSet: houseDefault,
  presets: [
    { key: 'house', label: 'House default', build: houseDefault },
    { key: 'classic2', label: 'Classic 2s wild', build: classic2sWild },
  ],
  createGame,
  reduce,
  botAction,
  toPublicState,
  split(state: GameState) {
    return { hands: state.players.map((p) => ({ seat: p.seat, userId: p.userId, cards: p.hand })), secret: state.stock };
  },
  merge(pub: PublicState, hands, secret) {
    const handBySeat = new Map(hands.map((h) => [h.seat, h.cards]));
    const { stockCount: _sc, players, ...rest } = pub;
    const stock: Card[] = Array.isArray(secret) ? secret : (secret?.stock ?? []);
    return { ...rest, stock, players: players.map(({ handCount: _hc, ...p }) => ({ ...p, hand: handBySeat.get(p.seat) ?? [] })) } as GameState;
  },
  statusOf: (s: GameState) => (s.phase === 'lobby' ? 'lobby' : s.phase === 'game.over' ? 'finished' : 'playing'),
  deadlineOf(s: GameState) {
    if (s.phase === 'lobby' || s.phase === 'round.over' || s.phase === 'game.over') return null;
    const c = [s.turnDeadline, s.buyWindow?.deadline].filter((x): x is number => typeof x === 'number');
    return c.length ? Math.min(...c) : null;
  },
  players: (s: GameState) => s.players,
};

const swoop: GameModule = {
  type: 'swoop',
  title: 'Swoop',
  tagline: 'Shed your cards: hand, then face-up, then blind. Last one holding cards loses.',
  validateRuleSet: validateSwoopRuleSet,
  defaultRuleSet: swoopDefault,
  presets: [
    { key: 'house', label: 'House Swoop', build: swoopDefault },
    { key: 'classic', label: 'Classic 3-3-3', build: swoopClassic },
  ],
  createGame: createSwoopGame,
  reduce: reduceSwoop,
  botAction: swoopBotAction,
  toPublicState: toSwoopPublicState,
  split(state: SwoopState) {
    return {
      hands: state.players.map((p) => ({ seat: p.seat, userId: p.userId, cards: p.hand })),
      secret: { stock: state.stock, faceDown: Object.fromEntries(state.players.map((p) => [p.seat, p.faceDown])) },
    };
  },
  merge(pub: SwoopPublicState, hands, secret) {
    const handBySeat = new Map(hands.map((h) => [h.seat, h.cards]));
    const { stockCount: _sc, pileTop: _pt, pileCount: _pc, players, ...rest } = pub;
    const faceDown: Record<string, Card[]> = secret?.faceDown ?? {};
    return {
      ...rest,
      stock: secret?.stock ?? [],
      players: players.map(({ handCount: _hc, faceDownCount: _fc, ...p }) => ({ ...p, hand: handBySeat.get(p.seat) ?? [], faceDown: faceDown[p.seat] ?? [] })),
    } as SwoopState;
  },
  statusOf: (s: SwoopState) => (s.phase === 'lobby' ? 'lobby' : s.phase === 'game.over' ? 'finished' : 'playing'),
  deadlineOf(s: SwoopState) {
    if (s.phase === 'lobby' || s.phase === 'round.over' || s.phase === 'game.over') return null;
    return s.turnDeadline ?? null;
  },
  players: (s: SwoopState) => s.players,
};

export const GAMES: Record<GameType, GameModule> = { shanghai, swoop };

export function gameModule(type: string | null | undefined): GameModule {
  return GAMES[(type as GameType) in GAMES ? (type as GameType) : 'shanghai'];
}
