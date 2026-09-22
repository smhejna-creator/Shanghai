import type { Card } from './cards.ts';
import type { GameState, PlayerState } from './state.ts';

export type PublicPlayer = Omit<PlayerState, 'hand'> & { handCount: number };

/** Game state with every secret removed. Stored on the game row. */
export interface PublicState extends Omit<GameState, 'stock' | 'players'> {
  stockCount: number;
  players: PublicPlayer[];
}

export interface PlayerView extends PublicState {
  mySeat: number | null;
  myHand: Card[];
}

export function toPublicState(state: GameState): PublicState {
  const { stock, players, ...rest } = state;
  return {
    ...rest,
    stockCount: stock.length,
    players: players.map(({ hand, ...p }) => ({ ...p, handCount: hand.length })),
  };
}

export function toPlayerView(state: GameState, userId: string | null): PlayerView {
  const pub = toPublicState(state);
  const me = userId ? state.players.find((p) => p.userId === userId) : undefined;
  return { ...pub, mySeat: me?.seat ?? null, myHand: me?.hand.slice() ?? [] };
}

/** Compose a view from a stored public state plus the caller's own hand row. */
export function composeView(pub: PublicState, mySeat: number | null, myHand: Card[]): PlayerView {
  return { ...pub, mySeat, myHand };
}
