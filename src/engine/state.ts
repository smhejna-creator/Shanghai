import type { Card } from './cards';
import type { Meld } from './melds';
import type { RuleSet } from './ruleset';

export type Phase = 'lobby' | 'dealing' | 'turn.draw' | 'buy.window' | 'turn.play' | 'round.over' | 'game.over';

export interface PlayerState {
  seat: number;
  userId: string;
  name: string;
  hand: Card[];
  buysLeft: number;
  hasLaidDown: boolean;
  scores: number[];
  ready: boolean;
  connected: boolean;
}

export interface BuyWindow {
  discardCardId: string;
  /** Seats in priority order (clockwise from the player after the new current player). */
  order: number[];
  /** Index of the seat that currently holds priority. */
  index: number;
  /** Seats that have claimed. */
  claims: number[];
  /** Epoch ms when priority passes from `order[index]`. */
  deadline: number;
}

export interface GameState {
  version: number;
  phase: Phase;
  hostUserId: string;
  roundIndex: number;
  dealerSeat: number;
  currentSeat: number;
  players: PlayerState[];
  stock: Card[];
  discard: Card[];
  melds: Meld[];
  buyWindow?: BuyWindow;
  turnDeadline?: number;
  /** Seat that went out this round, if any. */
  wentOutSeat?: number;
  winnerSeats?: number[];
  rngSeed: string;
  nextMeldId: number;
  /** Log of notable events for the UI (last 30). */
  log: string[];
}

export type Action =
  | { type: 'JOIN'; userId: string; name: string }
  | { type: 'LEAVE'; userId: string }
  | { type: 'SET_RULESET'; userId: string; ruleSet: RuleSet }
  | { type: 'READY'; userId: string; ready: boolean }
  | { type: 'START'; userId: string; now: number }
  | { type: 'DRAW_STOCK'; userId: string; now: number }
  | { type: 'DRAW_DISCARD'; userId: string; now: number }
  | { type: 'BUY'; userId: string; now: number }
  | { type: 'PASS_BUY'; userId: string; now: number }
  | { type: 'LAY_DOWN'; userId: string; melds: string[][]; now: number }
  | { type: 'LAY_OFF'; userId: string; meldId: string; cardIds: string[]; now: number }
  | {
      type: 'REPLACE_WILD';
      userId: string;
      meldId: string;
      wildCardId: string;
      naturalCardId: string;
      playTo: { meldId: string };
      now: number;
    }
  | { type: 'DISCARD'; userId: string; cardId: string; now: number }
  | { type: 'END_TURN'; userId: string; now: number }
  | { type: 'REORDER_HAND'; userId: string; cardIds: string[] }
  | { type: 'NEXT_ROUND'; userId: string; now: number }
  | { type: 'TICK'; now: number }
  | { type: 'RECONNECT'; userId: string }
  | { type: 'DISCONNECT'; userId: string };

export type ActionType = Action['type'];

export type ErrorCode =
  | 'NOT_A_PLAYER'
  | 'NOT_HOST'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'GAME_FULL'
  | 'ALREADY_JOINED'
  | 'NOT_READY'
  | 'TOO_FEW_PLAYERS'
  | 'INVALID_RULESET'
  | 'CARD_NOT_IN_HAND'
  | 'CONTRACT_NOT_MET'
  | 'INVALID_MELD'
  | 'ALREADY_LAID_DOWN'
  | 'NOT_LAID_DOWN'
  | 'LAY_OFF_NOT_ALLOWED'
  | 'MUST_KEEP_DISCARD'
  | 'NO_DISCARD_ROUND'
  | 'MUST_DISCARD'
  | 'NO_BUYS_LEFT'
  | 'NOT_ELIGIBLE_TO_BUY'
  | 'MELD_NOT_FOUND'
  | 'WILD_REPLACEMENT_DISABLED'
  | 'WILD_REPLACEMENT_NOT_ALLOWED'
  | 'WILD_MUST_BE_PLAYED'
  | 'NOTHING_TO_DO';

export interface EngineError {
  code: ErrorCode;
  message: string;
}

export type ReduceResult = { ok: true; state: GameState; ruleSet: RuleSet } | { ok: false; error: EngineError };
