import type { Card } from '../cards.ts';
import type { SwoopRuleSet } from './ruleset.ts';

export type SwoopPhase = 'lobby' | 'swap' | 'turn' | 'round.over' | 'game.over';

export interface SwoopPlayer {
  seat: number;
  userId: string;
  name: string;
  hand: Card[];
  faceUp: Card[];
  /** Secret even from the owner. */
  faceDown: Card[];
  doneSwapping: boolean;
  /** 0-based finishing order this round; undefined while still in. */
  finished?: number;
  scores: number[];
  ready: boolean;
  connected: boolean;
  isBot?: boolean;
}

export interface SwoopState {
  version: number;
  phase: SwoopPhase;
  hostUserId: string;
  roundIndex: number;
  dealerSeat: number;
  currentSeat: number;
  players: SwoopPlayer[];
  stock: Card[];
  pile: Card[];
  /** Cards cleared out of play this round. */
  cleared: Card[];
  /** Effective top rank constraint (after a reset the pile top is treated as open). */
  sevenActive: boolean;
  turnDeadline?: number;
  finishedCount: number;
  winnerSeats?: number[];
  rngSeed: string;
  log: string[];
}

export type SwoopAction =
  | { type: 'JOIN'; userId: string; name: string }
  | { type: 'LEAVE'; userId: string }
  | { type: 'ADD_BOT'; userId: string; botId: string; name: string }
  | { type: 'REMOVE_BOT'; userId: string; botId: string }
  | { type: 'SET_RULESET'; userId: string; ruleSet: SwoopRuleSet }
  | { type: 'READY'; userId: string; ready: boolean }
  | { type: 'START'; userId: string; now: number }
  | { type: 'SWAP'; userId: string; handCardId: string; faceUpCardId: string }
  | { type: 'DONE_SWAPPING'; userId: string; now: number }
  | { type: 'PLAY'; userId: string; cardIds: string[]; now: number }
  | { type: 'PLAY_BLIND'; userId: string; index: number; now: number }
  | { type: 'PICK_UP'; userId: string; now: number }
  | { type: 'REORDER_HAND'; userId: string; cardIds: string[] }
  | { type: 'NEXT_ROUND'; userId: string; now: number }
  | { type: 'TICK'; now: number }
  | { type: 'RECONNECT'; userId: string }
  | { type: 'DISCONNECT'; userId: string };

export type SwoopErrorCode =
  | 'NOT_A_PLAYER' | 'NOT_HOST' | 'NOT_YOUR_TURN' | 'WRONG_PHASE' | 'GAME_FULL' | 'ALREADY_JOINED' | 'NOT_READY'
  | 'TOO_FEW_PLAYERS' | 'INVALID_RULESET' | 'CARD_NOT_AVAILABLE' | 'ILLEGAL_PLAY' | 'MIXED_RANKS' | 'MUST_PLAY'
  | 'WRONG_SOURCE' | 'NOTHING_TO_DO' | 'ALREADY_FINISHED';

export type SwoopResult = { ok: true; state: SwoopState; ruleSet: SwoopRuleSet } | { ok: false; error: { code: SwoopErrorCode; message: string } };
