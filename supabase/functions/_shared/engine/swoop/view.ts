import type { Card } from '../cards.ts';
import type { SwoopPlayer, SwoopState } from './state.ts';

export type SwoopPublicPlayer = Omit<SwoopPlayer, 'hand' | 'faceDown'> & { handCount: number; faceDownCount: number };

export interface SwoopPublicState extends Omit<SwoopState, 'stock' | 'players'> {
  stockCount: number;
  players: SwoopPublicPlayer[];
  pileTop: Card | null;
  pileCount: number;
}

export interface SwoopPlayerView extends SwoopPublicState {
  mySeat: number | null;
  myHand: Card[];
}

export function toSwoopPublicState(state: SwoopState): SwoopPublicState {
  const { stock, players, ...rest } = state;
  return {
    ...rest,
    stockCount: stock.length,
    pileTop: state.pile[state.pile.length - 1] ?? null,
    pileCount: state.pile.length,
    players: players.map(({ hand, faceDown, ...p }) => ({ ...p, handCount: hand.length, faceDownCount: faceDown.length })),
  };
}

export function composeSwoopView(pub: SwoopPublicState, mySeat: number | null, myHand: Card[]): SwoopPlayerView {
  return { ...pub, mySeat, myHand };
}
