// A simple bot: pure function from state to the action it would take. The server
// runs bots after every human action; nothing here touches I/O.
import { cardScore, isWild, rankValue, type Card } from './cards.ts';
import type { RuleSet, Rank } from './ruleset.ts';
import { findContractMelds, findLayOffs } from './solver.ts';
import type { Action, GameState } from './state.ts';

/** How useful a card is to a hand: pairs, near-runs, wilds. Higher = keep. */
function usefulness(card: Card, hand: Card[], rs: RuleSet): number {
  if (isWild(card, rs)) return 100;
  let score = 0;
  for (const other of hand) {
    if (other.id === card.id || isWild(other, rs)) continue;
    if (other.rank === card.rank) score += 3;
    if (other.suit === card.suit) {
      const d = Math.abs(rankValue(other.rank as Rank) - rankValue(card.rank as Rank));
      if (d === 1) score += 2;
      else if (d === 2) score += 1;
    }
  }
  return score;
}

function wantsCard(card: Card, hand: Card[], rs: RuleSet): boolean {
  return isWild(card, rs) || usefulness(card, hand, rs) >= 3;
}

function worstCard(hand: Card[], rs: RuleSet): Card {
  let worst = hand[0];
  let worstKey = -Infinity;
  for (const c of hand) {
    // Discard low-usefulness, high-point cards first.
    const key = cardScore(c, rs) - usefulness(c, hand, rs) * 8;
    if (key > worstKey) {
      worstKey = key;
      worst = c;
    }
  }
  return worst;
}

/**
 * Returns the next action a bot should take, or null when no bot needs to act.
 * Checks the buy-window priority holder first, then the current player.
 */
export function botAction(rs: RuleSet, state: GameState, now: number): Action | null {
  if (state.phase === 'buy.window' && state.buyWindow) {
    const bw = state.buyWindow;
    const headSeat = bw.order[bw.index];
    const head = state.players[headSeat];
    if (head?.isBot) {
      const top = state.discard[state.discard.length - 1];
      const buy = top && head.buysLeft > 0 && wantsCard(top, head.hand, rs);
      return buy ? { type: 'BUY', userId: head.userId, now } : { type: 'PASS_BUY', userId: head.userId, now };
    }
  }
  const me = state.players[state.currentSeat];
  if (!me?.isBot) return null;
  const contract = rs.rounds[state.roundIndex];

  if (state.phase === 'turn.draw' || state.phase === 'buy.window') {
    const top = state.discard[state.discard.length - 1];
    if (top && wantsCard(top, me.hand, rs)) return { type: 'DRAW_DISCARD', userId: me.userId, now };
    return { type: 'DRAW_STOCK', userId: me.userId, now };
  }

  if (state.phase === 'turn.play') {
    if (!me.hasLaidDown) {
      const groups = findContractMelds(me.hand, contract, rs);
      if (groups && (contract.noDiscard || groups.flat().length < me.hand.length)) {
        return { type: 'LAY_DOWN', userId: me.userId, melds: groups.map((g) => g.map((c) => c.id)), now };
      }
    } else if (rs.layOff !== 'never') {
      const plays = findLayOffs(me.hand, state.melds, rs, contract.noDiscard ? 0 : 1);
      if (plays.length > 0) return { type: 'LAY_OFF', userId: me.userId, meldId: plays[0].meldId, cardIds: plays[0].cardIds, now };
    }
    if (contract.noDiscard) return { type: 'END_TURN', userId: me.userId, now };
    if (me.hand.length === 0) return null;
    return { type: 'DISCARD', userId: me.userId, cardId: worstCard(me.hand, rs).id, now };
  }
  return null;
}
