// Swoop bot: shed low cards, hoard specials, swoop when it pays.
import type { Card } from '../cards.ts';
import { cardKind, cardValue, isLegalPlay, legalRanks } from './rules.ts';
import type { SwoopRuleSet } from './ruleset.ts';
import type { SwoopAction, SwoopState } from './state.ts';
import { playSource } from './reducer.ts';

/** Higher = better to hold for the endgame. */
export function cardPower(card: Card, rs: SwoopRuleSet): number {
  const kind = cardKind(card, rs);
  if (kind === 'clear') return 100;
  if (kind === 'reset') return 90;
  return cardValue(card, rs);
}

export function swoopBotAction(rs: SwoopRuleSet, state: SwoopState, now: number): SwoopAction | null {
  if (state.phase === 'swap') {
    const bot = state.players.find((p) => p.isBot && !p.doneSwapping);
    if (!bot) return null;
    // Move the strongest cards face up: swap if the weakest face-up card is weaker than the strongest hand card.
    const weakestUp = bot.faceUp.slice().sort((a, b) => cardPower(a, rs) - cardPower(b, rs))[0];
    const strongestHand = bot.hand.slice().sort((a, b) => cardPower(b, rs) - cardPower(a, rs))[0];
    if (weakestUp && strongestHand && cardPower(strongestHand, rs) > cardPower(weakestUp, rs))
      return { type: 'SWAP', userId: bot.userId, handCardId: strongestHand.id, faceUpCardId: weakestUp.id };
    return { type: 'DONE_SWAPPING', userId: bot.userId, now };
  }
  if (state.phase !== 'turn') return null;
  const me = state.players[state.currentSeat];
  if (!me?.isBot || me.finished !== undefined) return null;
  const src = playSource(me);
  if (src === 'faceDown') return { type: 'PLAY_BLIND', userId: me.userId, index: 0, now };
  if (src === 'none') return null;
  const pool = src === 'hand' ? me.hand : me.faceUp;
  const ranks = legalRanks(pool, state, rs);
  if (ranks.length === 0) return { type: 'PICK_UP', userId: me.userId, now };

  const byRank = (r: string) => pool.filter((c) => c.rank === r);
  const top = state.pile[state.pile.length - 1];
  // Four of a kind opportunity: complete the top rank.
  if (rs.fourOfAKindClears && top) {
    const onTop = state.pile.slice().reverse().findIndex((c) => c.rank !== top.rank);
    const run = onTop === -1 ? state.pile.length : onTop;
    const mine = byRank(top.rank);
    if (run < 4 && mine.length >= 4 - run && isLegalPlay(mine, state, rs)) return { type: 'PLAY', userId: me.userId, cardIds: mine.slice(0, 4 - run).map((c) => c.id), now };
  }
  const normal = ranks.filter((r) => cardKind(byRank(r)[0], rs) === 'normal').sort((a, b) => cardValue(byRank(a)[0], rs) - cardValue(byRank(b)[0], rs));
  if (normal.length > 0) {
    // Play the lowest legal rank, all copies (dumping duplicates is free tempo).
    const r = normal[0];
    return { type: 'PLAY', userId: me.userId, cardIds: byRank(r).map((c) => c.id), now };
  }
  // Only specials are legal: use a reset before a clear, and prefer clearing a big pile.
  const resets = ranks.filter((r) => cardKind(byRank(r)[0], rs) === 'reset');
  const clears = ranks.filter((r) => cardKind(byRank(r)[0], rs) === 'clear');
  const pick = state.pile.length >= 6 && clears.length ? clears[0] : resets[0] ?? clears[0];
  if (pick === undefined) return { type: 'PICK_UP', userId: me.userId, now };
  return { type: 'PLAY', userId: me.userId, cardIds: [byRank(pick)[0].id], now };
}
