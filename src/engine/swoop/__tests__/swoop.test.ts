import { describe, expect, it } from 'vitest';
import type { Card } from '../../cards.ts';
import { c, cs } from '../../__tests__/helpers.ts';
import { autoPlay, createSwoopGame, playSource, reduceSwoop } from '../reducer.ts';
import { cardKind, cardValue, isLegalPlay, pileConstraint, topIsFourOfAKind } from '../rules.ts';
import { cardsPerPlayer, suggestedSwoopDecks, swoopClassic, swoopDefault, validateSwoopRuleSet, type SwoopRuleSet } from '../ruleset.ts';
import type { SwoopAction, SwoopState } from '../state.ts';
import { swoopBotAction } from '../bot.ts';
import { toSwoopPublicState } from '../view.ts';

const NOW = 1_700_000_000_000;
const custom = (): SwoopRuleSet => ({ ...swoopDefault(), name: 'Custom', sevenLower: true, afterClear: 'nextPlayer', voluntaryPickup: true, rounds: 2, acesHigh: false, clearRanks: ['J'], resetRanks: ['2', '3'] });
const RULESETS: [string, SwoopRuleSet][] = [
  ['house (4-4-7, 10s+jokers clear, 2s reset)', swoopDefault()],
  ['classic 3-3-3', swoopClassic()],
  ['custom (7-lower, J clears, no play-again, 2 rounds)', custom()],
];

function ok(rs: SwoopRuleSet, s: SwoopState, a: SwoopAction): SwoopState {
  const r = reduceSwoop(rs, s, a);
  if (!r.ok) throw new Error(`${a.type}: ${r.error.code} ${r.error.message}`);
  return r.state;
}
function fail(rs: SwoopRuleSet, s: SwoopState, a: SwoopAction): string {
  const r = reduceSwoop(rs, s, a);
  if (r.ok) throw new Error(`expected ${a.type} to fail`);
  return r.error.code;
}
function lobby(rs: SwoopRuleSet, n: number, seed = 'seed'): SwoopState {
  let s = createSwoopGame('u0', seed);
  for (let i = 0; i < n; i++) s = ok(rs, s, { type: 'JOIN', userId: `u${i}`, name: `P${i}` });
  for (let i = 1; i < n; i++) s = ok(rs, s, { type: 'READY', userId: `u${i}`, ready: true });
  return s;
}
/** A hand-built turn state: seat 0 to play. */
function turn(rs: SwoopRuleSet, hands: Card[][], pile: Card[] = [], opts: Partial<SwoopState> = {}): SwoopState {
  const base = createSwoopGame('u0', 'seed');
  return {
    ...base,
    phase: 'turn',
    players: hands.map((h, i) => ({ seat: i, userId: `u${i}`, name: `P${i}`, hand: h, faceUp: [], faceDown: [], doneSwapping: true, scores: [], ready: true, connected: true })),
    pile,
    stock: [],
    currentSeat: 0,
    turnDeadline: NOW + rs.turnTimerSeconds * 1000,
    ...opts,
  };
}

describe('swoop rule sets', () => {
  it('house default matches the spec', () => {
    const rs = swoopDefault();
    expect([rs.faceDown, rs.faceUp, rs.handSize]).toEqual([4, 4, 7]);
    expect(rs.clearRanks).toEqual(['10']);
    expect(rs.jokersClear).toBe(true);
    expect(rs.resetRanks).toEqual(['2']);
    expect(cardsPerPlayer(rs)).toBe(15);
  });
  it.each(RULESETS)('%s validates', (_n, rs) => expect(validateSwoopRuleSet(rs)).toEqual([]));
  it('rejects bad rule sets and suggests decks', () => {
    const rs = swoopDefault();
    expect(validateSwoopRuleSet({ ...rs, clearRanks: ['2'] }).join()).toMatch(/both clear and reset/);
    expect(validateSwoopRuleSet({ ...rs, decks: 1, players: { min: 4, max: 6 } }).join()).toMatch(/Not enough cards/);
    expect(validateSwoopRuleSet({ ...rs, faceDown: 0, faceUp: 0, handSize: 2 }).join()).toMatch(/at least 3/);
    expect(suggestedSwoopDecks(rs, 3)).toBe(2); // 45 + 10 > 54
    expect(suggestedSwoopDecks(rs, 2)).toBe(1);
  });
});

describe.each(RULESETS)('card rules under %s', (_n, rs) => {
  it('classifies clears, resets and normals', () => {
    for (const r of rs.clearRanks) expect(cardKind(c(`${r}H`), rs)).toBe('clear');
    for (const r of rs.resetRanks) expect(cardKind(c(`${r}H`), rs)).toBe('reset');
    expect(cardKind(c('JOKER'), rs)).toBe(rs.jokersClear ? 'clear' : 'reset');
    expect(cardKind(c('9H'), rs)).toBe('normal');
  });
  it('orders values with aces per rule', () => {
    expect(cardValue(c('AH'), rs)).toBe(rs.acesHigh ? 14 : 1);
    expect(cardValue(c('KH'), rs)).toBe(13);
    expect(cardValue(c('9H'), rs)).toBe(9);
  });
  it('equal or higher is legal; lower is not; specials always are', () => {
    const s = turn(rs, [cs('9H'), cs('4C')], cs('8D'));
    expect(isLegalPlay(cs('9H'), s, rs)).toBe(true);
    expect(isLegalPlay(cs('8H'), s, rs)).toBe(true);
    expect(isLegalPlay(cs('5H'), s, rs)).toBe(false);
    expect(isLegalPlay(cs('5H', '5S'), s, rs)).toBe(false);
    expect(isLegalPlay(cs('5H', '6S'), s, rs)).toBe(false); // mixed ranks
    for (const r of [...rs.clearRanks, ...rs.resetRanks]) expect(isLegalPlay([c(`${r}S`)], s, rs)).toBe(true);
    expect(isLegalPlay([c('JOKER')], s, rs)).toBe(true);
  });
  it('anything goes on an empty pile or after a reset', () => {
    expect(pileConstraint(turn(rs, [[]], []), rs).open).toBe(true);
    expect(pileConstraint(turn(rs, [[]], [c(`${rs.resetRanks[0]}S`)]), rs).open).toBe(true);
    expect(isLegalPlay(cs('3H'), turn(rs, [[]], [c('KS'), c(`${rs.resetRanks[0]}S`)]), rs)).toBe(true);
  });
  it('detects four of a kind on top', () => {
    expect(topIsFourOfAKind(cs('3H', '9S', '9D', '9C', '9H'))).toBe(true);
    expect(topIsFourOfAKind(cs('9S', '9D', '9C'))).toBe(false);
    expect(topIsFourOfAKind(cs('9S', '9D', '9C', '9H', '3D'))).toBe(false);
  });
});

describe.each(RULESETS)('dealing and swapping under %s', (_n, rs) => {
  const rules = { ...rs, decks: 2 };
  it('deals down/up/hand to everyone and starts left of the dealer', () => {
    const s = ok(rules, lobby(rules, 3), { type: 'START', userId: 'u0', now: NOW });
    for (const p of s.players) {
      expect(p.faceDown).toHaveLength(rules.faceDown);
      expect(p.faceUp).toHaveLength(rules.faceUp);
      expect(p.hand).toHaveLength(rules.handSize);
    }
    expect(s.stock).toHaveLength(2 * (52 + rules.jokersPerDeck) - 3 * cardsPerPlayer(rules));
    expect(s.currentSeat).toBe(1);
    expect(s.phase).toBe(rules.swapPhase ? 'swap' : 'turn');
  });
  it('swaps a hand card with a face-up card, then play starts when everyone is done', () => {
    let s = ok(rules, lobby(rules, 2), { type: 'START', userId: 'u0', now: NOW });
    if (s.phase !== 'swap') return;
    const p = s.players[0];
    const h = p.hand[0];
    const u = p.faceUp[0];
    s = ok(rules, s, { type: 'SWAP', userId: 'u0', handCardId: h.id, faceUpCardId: u.id });
    expect(s.players[0].faceUp[0].id).toBe(h.id);
    expect(s.players[0].hand[0].id).toBe(u.id);
    expect(fail(rules, s, { type: 'SWAP', userId: 'u0', handCardId: 'nope', faceUpCardId: u.id })).toBe('CARD_NOT_AVAILABLE');
    expect(fail(rules, s, { type: 'PLAY', userId: 'u1', cardIds: [s.players[1].hand[0].id], now: NOW })).toBe('WRONG_PHASE');
    s = ok(rules, s, { type: 'DONE_SWAPPING', userId: 'u0', now: NOW });
    expect(s.phase).toBe('swap');
    expect(fail(rules, s, { type: 'SWAP', userId: 'u0', handCardId: u.id, faceUpCardId: h.id })).toBe('WRONG_PHASE');
    s = ok(rules, s, { type: 'DONE_SWAPPING', userId: 'u1', now: NOW });
    expect(s.phase).toBe('turn');
  });
  it('swap timer ends swapping for everyone', () => {
    const s = ok(rules, lobby(rules, 2), { type: 'START', userId: 'u0', now: NOW });
    if (s.phase !== 'swap') return;
    expect(fail(rules, s, { type: 'TICK', now: NOW })).toBe('NOTHING_TO_DO');
    const a = ok(rules, s, { type: 'TICK', now: NOW + rules.swapTimerSeconds * 1000 });
    expect(a.phase).toBe('turn');
  });
});

describe.each(RULESETS)('playing under %s', (_n, rs) => {
  it('plays one or more of a rank, refills from stock, passes the turn', () => {
    const s = turn(rs, [cs('9H', '9S', '4C'), cs('KD')], cs('8D'), { stock: cs('3C', '3D', '3H') });
    const a = ok(rs, s, { type: 'PLAY', userId: 'u0', cardIds: [s.players[0].hand[0].id, s.players[0].hand[1].id], now: NOW });
    expect(a.pile.map((x) => x.rank)).toEqual(['8', '9', '9']);
    expect(a.players[0].hand.length).toBe(Math.min(rs.refillTo, 1 + 3));
    expect(a.currentSeat).toBe(1);
    expect(fail(rs, s, { type: 'PLAY', userId: 'u1', cardIds: [s.players[1].hand[0].id], now: NOW })).toBe('NOT_YOUR_TURN');
    expect(fail(rs, s, { type: 'PLAY', userId: 'u0', cardIds: [s.players[0].hand[2].id], now: NOW })).toBe('ILLEGAL_PLAY');
    expect(fail(rs, s, { type: 'PLAY', userId: 'u0', cardIds: [s.players[0].hand[0].id, s.players[0].hand[2].id], now: NOW })).toBe('MIXED_RANKS');
    expect(fail(rs, s, { type: 'PLAY', userId: 'u0', cardIds: ['zzz'], now: NOW })).toBe('CARD_NOT_AVAILABLE');
  });
  it('a clear card swoops the pile', () => {
    const clear = c(`${rs.clearRanks[0]}S`);
    const s = turn(rs, [[clear, c('4C')], cs('KD')], cs('8D', 'QD'));
    const a = ok(rs, s, { type: 'PLAY', userId: 'u0', cardIds: [clear.id], now: NOW });
    expect(a.pile).toHaveLength(0);
    expect(a.cleared).toHaveLength(3);
    expect(a.currentSeat).toBe(rs.afterClear === 'playAgain' ? 0 : 1);
  });
  it('a joker follows the joker rule', () => {
    const j = c('JOKER');
    const s = turn(rs, [[j, c('4C')], cs('KD')], cs('AD'));
    const a = ok(rs, s, { type: 'PLAY', userId: 'u0', cardIds: [j.id], now: NOW });
    if (rs.jokersClear) expect(a.pile).toHaveLength(0);
    else expect(pileConstraint(a, rs).open).toBe(true);
  });
  it('four of a kind clears (across plays) when enabled', () => {
    const s = turn(rs, [cs('9H', '9S', '4C'), cs('KD')], cs('9D', '9C'));
    const a = ok(rs, s, { type: 'PLAY', userId: 'u0', cardIds: [s.players[0].hand[0].id, s.players[0].hand[1].id], now: NOW });
    if (rs.fourOfAKindClears) {
      expect(a.pile).toHaveLength(0);
      expect(a.currentSeat).toBe(rs.afterClear === 'playAgain' ? 0 : 1);
    } else expect(a.pile).toHaveLength(4);
  });
  it('seven-lower rule', () => {
    const s0 = turn(rs, [cs('7H', 'KH'), cs('9D', '5C')], cs('4D'));
    const a = ok(rs, s0, { type: 'PLAY', userId: 'u0', cardIds: [s0.players[0].hand[0].id], now: NOW });
    const p1 = a.players[1];
    if (rs.sevenLower) {
      expect(fail(rs, a, { type: 'PLAY', userId: 'u1', cardIds: [p1.hand[0].id], now: NOW })).toBe('ILLEGAL_PLAY');
      expect(ok(rs, a, { type: 'PLAY', userId: 'u1', cardIds: [p1.hand[1].id], now: NOW }).pile.map((x) => x.rank)).toEqual(['4', '7', '5']);
    } else {
      expect(reduceSwoop(rs, a, { type: 'PLAY', userId: 'u1', cardIds: [p1.hand[0].id], now: NOW }).ok).toBe(true);
    }
  });
  it('picking up takes the whole pile; must play when able unless voluntary', () => {
    const s = turn(rs, [cs('4C'), cs('KD')], cs('8D', 'QD'));
    const a = ok(rs, s, { type: 'PICK_UP', userId: 'u0', now: NOW });
    expect(a.players[0].hand).toHaveLength(3);
    expect(a.pile).toHaveLength(0);
    expect(a.currentSeat).toBe(1);
    const canPlay = turn(rs, [cs('KC'), cs('KD')], cs('8D'));
    const r = reduceSwoop(rs, canPlay, { type: 'PICK_UP', userId: 'u0', now: NOW });
    expect(r.ok).toBe(rs.voluntaryPickup);
    expect(fail(rs, turn(rs, [cs('KC'), cs('KD')], []), { type: 'PICK_UP', userId: 'u0', now: NOW })).toBe('NOTHING_TO_DO');
  });
  it('plays from face-up cards once the hand is empty, then blind from face-down', () => {
    const s = turn(rs, [[], cs('KD')], cs('8D'));
    s.players[0].faceUp = cs('9H', '3C');
    s.players[0].faceDown = cs('AH', '2S');
    expect(playSource(s.players[0])).toBe('faceUp');
    expect(fail(rs, s, { type: 'PLAY_BLIND', userId: 'u0', index: 0, now: NOW })).toBe('WRONG_SOURCE');
    const a = ok(rs, s, { type: 'PLAY', userId: 'u0', cardIds: [s.players[0].faceUp[0].id], now: NOW });
    expect(a.players[0].faceUp).toHaveLength(1);
    // Force back to seat 0 with only face-down cards.
    const b: SwoopState = { ...a, currentSeat: 0, pile: cs('KD') };
    b.players[0].faceUp = [];
    expect(playSource(b.players[0])).toBe('faceDown');
    expect(fail(rs, b, { type: 'PLAY', userId: 'u0', cardIds: [b.players[0].faceDown[0].id], now: NOW })).toBe('WRONG_SOURCE');
    // A♥ blind on a K: legal if aces high, otherwise picks up.
    expect(fail(rs, b, { type: 'PLAY_BLIND', userId: 'u0', index: 5, now: NOW })).toBe('CARD_NOT_AVAILABLE');
    const flip = ok(rs, b, { type: 'PLAY_BLIND', userId: 'u0', index: 0, now: NOW });
    if (rs.acesHigh) {
      expect(flip.pile.map((x) => x.rank)).toEqual(['K', 'A']);
      expect(flip.players[0].hand).toHaveLength(0);
    } else {
      expect(flip.pile).toHaveLength(0);
      expect(flip.players[0].hand.map((x) => x.rank).sort()).toEqual(['A', 'K']);
      expect(flip.currentSeat).toBe(1);
    }
  });
  it('going out ends the round when one player is left; standings by finish order', () => {
    const s = turn(rs, [cs('9H'), cs('KD', '3C'), cs('5C')], cs('8D'));
    const a = ok(rs, s, { type: 'PLAY', userId: 'u0', cardIds: [s.players[0].hand[0].id], now: NOW });
    expect(a.players[0].finished).toBe(0);
    expect(a.phase).toBe('turn');
    expect(a.currentSeat).toBe(1);
    // Seat 1 goes out via K then (next time) 3; simulate seat 2 playing then seat 1 emptying.
    const b = ok(rs, a, { type: 'PLAY', userId: 'u1', cardIds: [a.players[1].hand[0].id], now: NOW }); // K on 9
    expect(b.currentSeat).toBe(2);
    const cst = ok(rs, b, { type: 'PICK_UP', userId: 'u2', now: NOW }); // 5 can't go on K
    expect(cst.currentSeat).toBe(1);
    const d = ok(rs, cst, { type: 'PLAY', userId: 'u1', cardIds: [cst.players[1].hand[0].id], now: NOW }); // 3 on empty pile
    expect(d.players[1].finished).toBe(1);
    expect(d.players[2].finished).toBe(2);
    expect(d.players.map((p) => p.scores[0])).toEqual([0, 1, 2]);
    expect(d.phase).toBe(rs.rounds > 1 ? 'round.over' : 'game.over');
    if (rs.rounds === 1) expect(d.winnerSeats).toEqual([0]);
    else {
      const e = ok(rs, d, { type: 'NEXT_ROUND', userId: 'u0', now: NOW });
      expect(e.roundIndex).toBe(1);
      expect(e.dealerSeat).toBe(1);
      expect(fail(rs, d, { type: 'NEXT_ROUND', userId: 'u1', now: NOW })).toBe('NOT_HOST');
    }
  });
  it('turn timer auto-plays the lowest legal card or picks up', () => {
    const s = turn(rs, [cs('QH', '9S', '4C'), cs('KD')], cs('8D'), { turnDeadline: NOW });
    const a = ok(rs, s, { type: 'TICK', now: NOW });
    expect(a.pile[a.pile.length - 1].rank).toBe('9');
    const stuck = turn(rs, [cs('4C'), cs('KD')], cs('8D'), { turnDeadline: NOW });
    expect(autoPlay(stuck, rs, 0, NOW).type).toBe('PICK_UP');
    expect(ok(rs, stuck, { type: 'TICK', now: NOW }).players[0].hand).toHaveLength(2);
  });
  it('public state hides hands, face-down cards, and the stock', () => {
    const s = turn(rs, [cs('9H'), cs('KD')], cs('8D'), { stock: cs('3C') });
    s.players[0].faceDown = cs('AH');
    const pub = toSwoopPublicState(s);
    expect((pub as unknown as { stock?: unknown }).stock).toBeUndefined();
    expect(pub.stockCount).toBe(1);
    expect((pub.players[0] as unknown as { hand?: unknown }).hand).toBeUndefined();
    expect((pub.players[0] as unknown as { faceDown?: unknown }).faceDown).toBeUndefined();
    expect(pub.players[0].faceDownCount).toBe(1);
    expect(pub.pileTop?.rank).toBe('8');
  });
});

describe.each(RULESETS)('bots under %s', (_n, rs) => {
  it('bots swap strong cards face up and play full games to completion', () => {
    const rules = { ...rs, decks: 2 };
    let s = createSwoopGame('u0', 'swoop-bots');
    s = ok(rules, s, { type: 'JOIN', userId: 'u0', name: 'Host' });
    for (let i = 1; i < 4; i++) s = ok(rules, s, { type: 'ADD_BOT', userId: 'u0', botId: `b${i}`, name: `Bot ${i}` });
    s.players[0].isBot = true;
    s = ok(rules, s, { type: 'START', userId: 'u0', now: NOW });
    let steps = 0;
    let sawSwap = false;
    while (s.phase !== 'game.over' && steps++ < 20_000) {
      if (s.phase === 'round.over') {
        s = ok(rules, s, { type: 'NEXT_ROUND', userId: 'u0', now: NOW });
        continue;
      }
      const a = swoopBotAction(rules, s, NOW + steps);
      if (!a) throw new Error(`bot stuck in ${s.phase}`);
      if (a.type === 'SWAP') sawSwap = true;
      s = ok(rules, s, a);
    }
    expect(s.phase).toBe('game.over');
    if (rules.swapPhase && rules.faceUp > 0) expect(sawSwap).toBe(true);
    for (const p of s.players) expect(p.scores).toHaveLength(rules.rounds);
    // Card conservation at the end of the last round.
    const total = rules.decks * (52 + rules.jokersPerDeck);
    const all = [...s.stock, ...s.pile, ...s.cleared, ...s.players.flatMap((p) => [...p.hand, ...p.faceUp, ...p.faceDown])];
    expect(all).toHaveLength(total);
    expect(new Set(all.map((x) => x.id)).size).toBe(total);
  });
  it('a bot completes four of a kind when it can', () => {
    if (!rs.fourOfAKindClears) return;
    const s = turn(rs, [cs('9H', '9S', '4C'), cs('KD')], cs('9D', '9C'));
    s.players[0].isBot = true;
    const a = swoopBotAction(rs, s, NOW)!;
    expect(a.type).toBe('PLAY');
    if (a.type === 'PLAY') expect(a.cardIds).toHaveLength(2);
  });
  it('a bot saves specials for when it must', () => {
    const s = turn(rs, [[c(`${rs.clearRanks[0]}S`), c('QC')], cs('KD')], cs('8D'));
    s.players[0].isBot = true;
    const a = swoopBotAction(rs, s, NOW)!;
    if (a.type === 'PLAY') expect(s.players[0].hand.find((x) => x.id === a.cardIds[0])?.rank).toBe('Q');
  });
});
