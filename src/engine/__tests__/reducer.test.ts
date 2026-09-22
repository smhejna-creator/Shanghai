import { describe, expect, it } from 'vitest';
import { createGame, eligibleBuyers, reduce } from '../reducer.ts';
import { houseDefault } from '../ruleset.ts';
import type { RunMeld, SetMeld } from '../melds.ts';
import { toPlayerView, toPublicState } from '../view.ts';
import { findContractMelds, findLayOffs } from '../solver.ts';
import { c, cs, fail, ids, NOW, ok, playing, RULESETS, startedGame } from './helpers.ts';

describe.each(RULESETS)('lobby under %s', (_n, rs) => {
  it('joins, readies, and starts with dealer at seat 0', () => {
    let s = createGame('u0', 'seed');
    s = ok(rs, s, { type: 'JOIN', userId: 'u0', name: 'Host' });
    s = ok(rs, s, { type: 'JOIN', userId: 'u1', name: 'Guest' });
    expect(fail(rs, s, { type: 'JOIN', userId: 'u1', name: 'Guest' })).toBe('ALREADY_JOINED');
    expect(fail(rs, s, { type: 'START', userId: 'u1', now: NOW })).toBe('NOT_HOST');
    expect(fail(rs, s, { type: 'START', userId: 'u0', now: NOW })).toBe('NOT_READY');
    s = ok(rs, s, { type: 'READY', userId: 'u1', ready: true });
    s = ok(rs, s, { type: 'START', userId: 'u0', now: NOW });
    expect(s.phase).toBe('turn.draw');
    expect(s.dealerSeat).toBe(0);
    expect(s.currentSeat).toBe(1);
    expect(s.version).toBe(4);
  });
  it('enforces player limits', () => {
    let s = createGame('u0', 'seed');
    s = ok(rs, s, { type: 'JOIN', userId: 'u0', name: 'Host' });
    expect(fail(rs, s, { type: 'START', userId: 'u0', now: NOW })).toBe('TOO_FEW_PLAYERS');
    for (let i = 1; i < rs.players.max; i++) s = ok(rs, s, { type: 'JOIN', userId: `u${i}`, name: `P${i}` });
    expect(fail(rs, s, { type: 'JOIN', userId: 'extra', name: 'X' })).toBe('GAME_FULL');
  });
  it('leave reseats remaining players', () => {
    let s = createGame('u0', 'seed');
    for (let i = 0; i < 3; i++) s = ok(rs, s, { type: 'JOIN', userId: `u${i}`, name: `P${i}` });
    s = ok(rs, s, { type: 'LEAVE', userId: 'u1' });
    expect(s.players.map((p) => [p.userId, p.seat])).toEqual([['u0', 0], ['u2', 1]]);
  });
  it('host can change rules; invalid rules rejected; ready resets', () => {
    let s = createGame('u0', 'seed');
    s = ok(rs, s, { type: 'JOIN', userId: 'u0', name: 'Host' });
    s = ok(rs, s, { type: 'JOIN', userId: 'u1', name: 'G' });
    s = ok(rs, s, { type: 'READY', userId: 'u1', ready: true });
    const r = reduce(rs, s, { type: 'SET_RULESET', userId: 'u0', ruleSet: { ...rs, buysPerRound: 5 } });
    expect(r.ok && r.ruleSet.buysPerRound).toBe(5);
    expect(r.ok && r.state.players[1].ready).toBe(false);
    expect(fail(rs, s, { type: 'SET_RULESET', userId: 'u1', ruleSet: rs })).toBe('NOT_HOST');
    expect(fail(rs, s, { type: 'SET_RULESET', userId: 'u0', ruleSet: { ...rs, rounds: [] } })).toBe('INVALID_RULESET');
  });
});

describe.each(RULESETS)('dealing under %s', (_n, rs) => {
  it('deals cardsPerRound to each player, flips one discard, starts left of dealer', () => {
    const s = startedGame(rs, 3);
    for (const p of s.players) {
      expect(p.hand).toHaveLength(rs.cardsPerRound);
      expect(p.buysLeft).toBe(rs.buysPerRound);
      expect(p.hasLaidDown).toBe(false);
    }
    expect(s.discard).toHaveLength(1);
    expect(s.stock).toHaveLength(rs.decks * (52 + rs.jokersPerDeck) - 3 * rs.cardsPerRound - 1);
    expect(s.currentSeat).toBe(1);
    expect(s.turnDeadline).toBe(NOW + rs.turnTimerSeconds * 1000);
  });
  it('is deterministic for a seed', () => {
    const a = startedGame(rs, 2, 'x');
    const b = startedGame(rs, 2, 'x');
    const other = startedGame(rs, 2, 'y');
    expect(ids(a.players[0].hand)).toEqual(ids(b.players[0].hand));
    expect(ids(a.players[0].hand)).not.toEqual(ids(other.players[0].hand));
  });
});

describe.each(RULESETS)('drawing under %s', (_n, rs) => {
  it('draws from stock or discard, only on your turn', () => {
    const s = playing(rs, [cs('3H'), cs('4H')], { phase: 'turn.draw' });
    expect(fail(rs, s, { type: 'DRAW_STOCK', userId: 'u1', now: NOW })).toBe('NOT_YOUR_TURN');
    const a = ok(rs, s, { type: 'DRAW_STOCK', userId: 'u0', now: NOW });
    expect(a.players[0].hand).toHaveLength(2);
    expect(a.stock).toHaveLength(s.stock.length - 1);
    expect(a.phase).toBe('turn.play');
    const b = ok(rs, s, { type: 'DRAW_DISCARD', userId: 'u0', now: NOW });
    expect(b.players[0].hand.map((x) => x.id)).toContain(s.discard[0].id);
    expect(b.discard).toHaveLength(0);
    expect(fail(rs, a, { type: 'DRAW_STOCK', userId: 'u0', now: NOW })).toBe('WRONG_PHASE');
  });
  it('reshuffles the discard pile when the stock runs out', () => {
    const s = playing(rs, [cs('3H'), cs('4H')], { phase: 'turn.draw', stock: [], discard: cs('5D', '6D', '7D', '8D') });
    const a = ok(rs, s, { type: 'DRAW_STOCK', userId: 'u0', now: NOW });
    expect(a.discard.map((x) => x.rank)).toEqual(['8']);
    expect(a.stock).toHaveLength(2);
    expect(a.players[0].hand).toHaveLength(2);
  });
  it('ends the round when nothing is left to draw', () => {
    const s = playing(rs, [cs('3H'), cs('4H')], { phase: 'turn.draw', stock: [], discard: cs('5D') });
    const a = ok(rs, s, { type: 'DRAW_STOCK', userId: 'u0', now: NOW });
    expect(['round.over', 'game.over']).toContain(a.phase);
    expect(a.wentOutSeat).toBeUndefined();
  });
});

describe.each(RULESETS)('laying down under %s', (_n, rs) => {
  const contract = rs.rounds[0];
  // Groups that satisfy round 1 of each rule set.
  const goodGroups = () =>
    contract.melds.map((m, i) =>
      m.kind === 'set' ? cs(...Array(m.size).fill(`${['7', 'K', '3'][i]}H`)) : cs(...['4', '5', '6', '7', '8', '9'].slice(0, m.size).map((r) => `${r}${['S', 'D', 'C'][i]}`)),
    );
  it('lays down the contract and rejects a second lay-down', () => {
    const groups = goodGroups();
    const s = playing(rs, [[...groups.flat(), c('9C')], cs('4H')]);
    const a = ok(rs, s, { type: 'LAY_DOWN', userId: 'u0', melds: groups.map(ids), now: NOW });
    expect(a.players[0].hasLaidDown).toBe(true);
    expect(a.melds).toHaveLength(contract.melds.length);
    expect(a.melds.every((m) => m.ownerSeat === 0)).toBe(true);
    expect(a.players[0].hand).toHaveLength(1);
    expect(fail(rs, a, { type: 'LAY_DOWN', userId: 'u0', melds: [[a.players[0].hand[0].id]], now: NOW })).toBe('ALREADY_LAID_DOWN');
  });
  it('rejects melds that do not meet the contract, leaving the hand intact', () => {
    const groups = goodGroups();
    groups[0][0] = c('QD');
    const s = playing(rs, [[...groups.flat(), c('9C')], cs('4H')]);
    expect(fail(rs, s, { type: 'LAY_DOWN', userId: 'u0', melds: groups.map(ids), now: NOW })).toBe('CONTRACT_NOT_MET');
    const bad = reduce(rs, s, { type: 'LAY_DOWN', userId: 'u0', melds: groups.map(ids), now: NOW });
    expect(bad.ok).toBe(false);
  });
  it('rejects cards not in hand and wrong phase / wrong player', () => {
    const groups = goodGroups();
    const s = playing(rs, [[...groups.flat(), c('9C')], cs('4H')]);
    expect(fail(rs, s, { type: 'LAY_DOWN', userId: 'u1', melds: groups.map(ids), now: NOW })).toBe('NOT_YOUR_TURN');
    expect(fail(rs, { ...s, phase: 'turn.draw' }, { type: 'LAY_DOWN', userId: 'u0', melds: groups.map(ids), now: NOW })).toBe('WRONG_PHASE');
    const other = groups.map(ids);
    other[0][0] = 'nope';
    expect(fail(rs, s, { type: 'LAY_DOWN', userId: 'u0', melds: other, now: NOW })).toBe('CARD_NOT_IN_HAND');
  });
  it('must keep a card to discard in a normal round', () => {
    const groups = goodGroups();
    const s = playing(rs, [groups.flat(), cs('4H')]);
    expect(fail(rs, s, { type: 'LAY_DOWN', userId: 'u0', melds: groups.map(ids), now: NOW })).toBe('MUST_KEEP_DISCARD');
  });
});

describe.each(RULESETS)('laying off under %s', (_n, rs) => {
  const set: SetMeld = { id: 'm1', ownerSeat: 1, kind: 'set', rank: '7', cards: cs('7H', '7S', '7D') };
  const run: RunMeld = { id: 'm2', ownerSeat: 1, kind: 'run', suit: 'H', lowValue: 4, cards: cs('4H', '5H', '6H', '7H') };
  const base = () => playing(rs, [cs('7C', '8H', '3H', 'KD'), cs('4S')], { melds: [set, run] });
  it('requires having laid down', () => {
    const s = base();
    expect(fail(rs, s, { type: 'LAY_OFF', userId: 'u0', meldId: 'm1', cardIds: [s.players[0].hand[0].id], now: NOW })).toBe('NOT_LAID_DOWN');
  });
  it('lays off onto anyone\'s meld after laying down', () => {
    const s = base();
    s.players[0].hasLaidDown = true;
    const a = ok(rs, s, { type: 'LAY_OFF', userId: 'u0', meldId: 'm1', cardIds: [s.players[0].hand[0].id], now: NOW });
    expect(a.melds[0].cards).toHaveLength(4);
    const b = ok(rs, a, { type: 'LAY_OFF', userId: 'u0', meldId: 'm2', cardIds: [a.players[0].hand[0].id, a.players[0].hand[1].id], now: NOW });
    expect(b.melds[1].cards).toHaveLength(6);
    expect(b.players[0].hand).toHaveLength(1);
    expect(fail(rs, b, { type: 'LAY_OFF', userId: 'u0', meldId: 'm2', cardIds: [b.players[0].hand[0].id], now: NOW })).toBe('INVALID_MELD');
    expect(fail(rs, b, { type: 'LAY_OFF', userId: 'u0', meldId: 'zzz', cardIds: [b.players[0].hand[0].id], now: NOW })).toBe('MELD_NOT_FOUND');
  });
  it('is blocked when the rule set disables it', () => {
    const s = base();
    s.players[0].hasLaidDown = true;
    const noLayOff = { ...rs, layOff: 'never' as const };
    expect(fail(noLayOff, s, { type: 'LAY_OFF', userId: 'u0', meldId: 'm1', cardIds: [s.players[0].hand[0].id], now: NOW })).toBe('LAY_OFF_NOT_ALLOWED');
  });
  it('cannot empty the hand in a normal round', () => {
    const s = playing(rs, [cs('7C'), cs('4S')], { melds: [set, run] });
    s.players[0].hasLaidDown = true;
    expect(fail(rs, s, { type: 'LAY_OFF', userId: 'u0', meldId: 'm1', cardIds: [s.players[0].hand[0].id], now: NOW })).toBe('MUST_KEEP_DISCARD');
  });
});

describe.each(RULESETS)('wild replacement under %s', (_n, rs) => {
  const w = () => c('JOKER');
  const setup = (ownerSeat: number, laidDown = true) => {
    const wild = w();
    const run: RunMeld = { id: 'r', ownerSeat, kind: 'run', suit: 'H', lowValue: 4, cards: [c('4H'), c('5H'), wild, c('7H')] };
    const set: SetMeld = { id: 's', ownerSeat: 1, kind: 'set', rank: '9', cards: cs('9H', '9S', '9D') };
    const s = playing(rs, [cs('6H', 'KD'), cs('4S')], { melds: [run, set] });
    s.players[0].hasLaidDown = laidDown;
    return { s, wild, natural: s.players[0].hand[0] };
  };
  it('owner replaces a wild and must play it immediately', () => {
    const { s, wild, natural } = setup(0);
    const a = ok(rs, s, { type: 'REPLACE_WILD', userId: 'u0', meldId: 'r', wildCardId: wild.id, naturalCardId: natural.id, playTo: { meldId: 's' }, now: NOW });
    expect(a.melds[0].cards[2].id).toBe(natural.id);
    expect(a.melds[1].cards.map((x) => x.id)).toContain(wild.id);
    expect(a.players[0].hand).toHaveLength(1);
  });
  it('a player who has laid down may replace in another player\'s run', () => {
    const { s, wild, natural } = setup(1);
    const a = ok(rs, s, { type: 'REPLACE_WILD', userId: 'u0', meldId: 'r', wildCardId: wild.id, naturalCardId: natural.id, playTo: { meldId: 'r' }, now: NOW });
    expect(a.melds[0].cards).toHaveLength(5); // wild went on the end of the same run
  });
  it('ownerOnly rule blocks non-owners', () => {
    const { s, wild, natural } = setup(1);
    const rules = { ...rs, wildReplacement: { ...rs.wildReplacement, who: 'ownerOnly' as const } };
    expect(fail(rules, s, { type: 'REPLACE_WILD', userId: 'u0', meldId: 'r', wildCardId: wild.id, naturalCardId: natural.id, playTo: { meldId: 's' }, now: NOW })).toBe('WILD_REPLACEMENT_NOT_ALLOWED');
  });
  it('requires having laid down, and can be disabled', () => {
    const { s, wild, natural } = setup(1, false);
    expect(fail(rs, s, { type: 'REPLACE_WILD', userId: 'u0', meldId: 'r', wildCardId: wild.id, naturalCardId: natural.id, playTo: { meldId: 's' }, now: NOW })).toBe('NOT_LAID_DOWN');
    const disabled = { ...rs, wildReplacement: { ...rs.wildReplacement, enabled: false } };
    expect(fail(disabled, s, { type: 'REPLACE_WILD', userId: 'u0', meldId: 'r', wildCardId: wild.id, naturalCardId: natural.id, playTo: { meldId: 's' }, now: NOW })).toBe('WILD_REPLACEMENT_DISABLED');
  });
  it('rejects the wrong natural and unplayable wild targets atomically', () => {
    const { s, wild } = setup(0);
    const king = s.players[0].hand[1];
    expect(fail(rs, s, { type: 'REPLACE_WILD', userId: 'u0', meldId: 'r', wildCardId: wild.id, naturalCardId: king.id, playTo: { meldId: 's' }, now: NOW })).toBe('INVALID_MELD');
    // Fill the set with wilds so no more can be added.
    const full = structuredClone(s);
    (full.melds[1] as SetMeld).cards = [c('9H'), c('JOKER')];
    const natural = full.players[0].hand[0];
    expect(fail(rs, full, { type: 'REPLACE_WILD', userId: 'u0', meldId: 'r', wildCardId: wild.id, naturalCardId: natural.id, playTo: { meldId: 's' }, now: NOW })).toBe('WILD_MUST_BE_PLAYED');
    // Nothing changed.
    const r = reduce(rs, full, { type: 'REPLACE_WILD', userId: 'u0', meldId: 'r', wildCardId: wild.id, naturalCardId: natural.id, playTo: { meldId: 's' }, now: NOW });
    expect(r.ok).toBe(false);
  });
  it('lets the wild stay in hand when mustPlayImmediately is off', () => {
    const { s, wild, natural } = setup(0);
    (s.melds[1] as SetMeld).cards = [c('9H'), c('JOKER')];
    const rules = { ...rs, wildReplacement: { ...rs.wildReplacement, mustPlayImmediately: false } };
    const a = ok(rules, s, { type: 'REPLACE_WILD', userId: 'u0', meldId: 'r', wildCardId: wild.id, naturalCardId: natural.id, playTo: { meldId: 's' }, now: NOW });
    expect(a.players[0].hand.map((x) => x.id)).toContain(wild.id);
  });
});

describe.each(RULESETS)('discarding and buying under %s', (_n, rs) => {
  const four = () => playing(rs, [cs('3H', 'KD'), cs('4H'), cs('5H'), cs('6H')]);
  it('discard advances the turn and opens a buy window for eligible out-of-turn players', () => {
    const s = four();
    const a = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[1].id, now: NOW });
    expect(a.discard[a.discard.length - 1].rank).toBe('K');
    expect(a.currentSeat).toBe(1);
    if (rs.buysPerRound > 0) {
      expect(a.phase).toBe('buy.window');
      expect(a.buyWindow?.order).toEqual([2, 3]); // clockwise after the new current player, excluding the discarder
      expect(a.buyWindow?.deadline).toBe(NOW + rs.buyWindowSeconds * 1000);
      expect(eligibleBuyers(a)).toEqual([2, 3]);
    }
  });
  it('no window when nobody can buy', () => {
    const s = four();
    for (const p of s.players) p.buysLeft = 0;
    const a = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[1].id, now: NOW });
    expect(a.phase).toBe('turn.draw');
    expect(a.buyWindow).toBeUndefined();
  });
  it('players who have laid down cannot buy', () => {
    const s = four();
    s.players[2].hasLaidDown = true;
    const a = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[1].id, now: NOW });
    if (rs.buysPerRound === 0) return;
    expect(a.buyWindow?.order).toEqual([3]);
    expect(fail(rs, a, { type: 'BUY', userId: 'u2', now: NOW })).toBe('NOT_ELIGIBLE_TO_BUY');
  });
  it('priority holder buys: gets the discard + penalty cards, buys decrement', () => {
    const s = four();
    const a = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[1].id, now: NOW });
    if (rs.buysPerRound === 0) return;
    const stockBefore = a.stock.length;
    const b = ok(rs, a, { type: 'BUY', userId: 'u2', now: NOW });
    expect(b.phase).toBe('turn.draw');
    expect(b.buyWindow).toBeUndefined();
    expect(b.players[2].hand).toHaveLength(1 + 1 + rs.buyPenaltyCards);
    expect(b.players[2].hand.some((x) => x.rank === 'K')).toBe(true);
    expect(b.players[2].buysLeft).toBe(rs.buysPerRound - 1);
    expect(b.stock).toHaveLength(stockBefore - rs.buyPenaltyCards);
    expect(b.discard.some((x) => x.rank === 'K')).toBe(false);
    expect(b.currentSeat).toBe(1);
    // The discard is gone, so the current player can only draw from stock.
    expect(fail(rs, { ...b, discard: [] }, { type: 'DRAW_DISCARD', userId: 'u1', now: NOW })).toBe('NOTHING_TO_DO');
  });
  it('a lower-priority claim waits; the higher-priority player wins if they claim', () => {
    const s = four();
    const a = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[1].id, now: NOW });
    if (rs.buysPerRound === 0) return;
    const b = ok(rs, a, { type: 'BUY', userId: 'u3', now: NOW });
    expect(b.phase).toBe('buy.window');
    expect(b.buyWindow?.claims).toEqual([3]);
    const c1 = ok(rs, b, { type: 'BUY', userId: 'u2', now: NOW });
    expect(c1.players[2].hand.some((x) => x.rank === 'K')).toBe(true);
    expect(c1.players[3].hand).toHaveLength(1);
  });
  it('passing priority hands the card to the next claimant', () => {
    const s = four();
    const a = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[1].id, now: NOW });
    if (rs.buysPerRound === 0) return;
    const b = ok(rs, a, { type: 'BUY', userId: 'u3', now: NOW });
    const c1 = ok(rs, b, { type: 'PASS_BUY', userId: 'u2', now: NOW });
    expect(c1.phase).toBe('turn.draw');
    expect(c1.players[3].hand.some((x) => x.rank === 'K')).toBe(true);
    expect(c1.players[3].buysLeft).toBe(rs.buysPerRound - 1);
  });
  it('everyone passing closes the window', () => {
    const s = four();
    const a = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[1].id, now: NOW });
    if (rs.buysPerRound === 0) return;
    const b = ok(rs, a, { type: 'PASS_BUY', userId: 'u2', now: NOW });
    expect(b.buyWindow?.index).toBe(1);
    const c1 = ok(rs, b, { type: 'PASS_BUY', userId: 'u3', now: NOW });
    expect(c1.phase).toBe('turn.draw');
    expect(c1.discard.some((x) => x.rank === 'K')).toBe(true);
  });
  it('the current player drawing from stock resolves the window in priority order', () => {
    const s = four();
    const a = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[1].id, now: NOW });
    if (rs.buysPerRound === 0) return;
    const b = ok(rs, a, { type: 'BUY', userId: 'u3', now: NOW });
    const c1 = ok(rs, b, { type: 'DRAW_STOCK', userId: 'u1', now: NOW });
    expect(c1.phase).toBe('turn.play');
    expect(c1.players[3].hand.some((x) => x.rank === 'K')).toBe(true);
    expect(c1.players[1].hand).toHaveLength(2);
  });
  it('the current player taking the discard cancels the window', () => {
    const s = four();
    const a = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[1].id, now: NOW });
    if (rs.buysPerRound === 0) return;
    const b = ok(rs, a, { type: 'BUY', userId: 'u2', now: NOW });
    // u2 held priority so this resolved immediately; use a lower-priority claim instead.
    expect(b.phase).toBe('turn.draw');
    const b2 = ok(rs, ok(rs, a, { type: 'BUY', userId: 'u3', now: NOW }), { type: 'DRAW_DISCARD', userId: 'u1', now: NOW });
    expect(b2.buyWindow).toBeUndefined();
    expect(b2.players[1].hand.some((x) => x.rank === 'K')).toBe(true);
    expect(b2.players[3].hand).toHaveLength(1);
  });
  it('rejects buys with none left, out of window, or by the discarder', () => {
    const s = four();
    s.players[2].buysLeft = 0;
    const a = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[1].id, now: NOW });
    if (rs.buysPerRound === 0) return;
    expect(fail(rs, a, { type: 'BUY', userId: 'u2', now: NOW })).toBe('NO_BUYS_LEFT');
    expect(fail(rs, a, { type: 'BUY', userId: 'u0', now: NOW })).toBe('NOT_ELIGIBLE_TO_BUY');
    expect(fail(rs, s, { type: 'BUY', userId: 'u3', now: NOW })).toBe('WRONG_PHASE');
  });
  it('buy priority passes on timeout', () => {
    const s = four();
    const a = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[1].id, now: NOW });
    if (rs.buysPerRound === 0) return;
    expect(fail(rs, a, { type: 'TICK', now: NOW + 1000 })).toBe('NOTHING_TO_DO');
    const b = ok(rs, a, { type: 'TICK', now: NOW + rs.buyWindowSeconds * 1000 });
    expect(b.buyWindow?.index).toBe(1);
    expect(eligibleBuyers(b)).toEqual([3]);
    const c1 = ok(rs, b, { type: 'TICK', now: NOW + 2 * rs.buyWindowSeconds * 1000 });
    expect(c1.phase).toBe('turn.draw');
  });
});

describe.each(RULESETS)('going out under %s', (_n, rs) => {
  it('discarding the last card ends the round and scores everyone else', () => {
    const s = playing(rs, [cs('3H'), cs('KH', 'AS', 'JOKER'), cs('5H')]);
    const a = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[0].id, now: NOW });
    expect(a.phase).toBe(rs.rounds.length === 1 ? 'game.over' : 'round.over');
    expect(a.wentOutSeat).toBe(0);
    expect(a.players[0].scores[0]).toBe(0);
    expect(a.players[1].scores[0]).toBe(rs.scoring.faceCards + rs.scoring.ace + rs.scoring.joker);
    expect(a.players[2].scores[0]).toBe(5);
  });
  it('no-discard round: discarding is refused, going out by laying off is the win', () => {
    const noDiscardIndex = rs.rounds.findIndex((r) => r.noDiscard);
    const set: SetMeld = { id: 'm1', ownerSeat: 1, kind: 'set', rank: '7', cards: cs('7H', '7S', '7D') };
    const s = playing(rs, [cs('7C'), cs('KH')], { roundIndex: noDiscardIndex, melds: [set] });
    s.players[0].hasLaidDown = true;
    expect(fail(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[0].id, now: NOW })).toBe('NO_DISCARD_ROUND');
    const a = ok(rs, s, { type: 'LAY_OFF', userId: 'u0', meldId: 'm1', cardIds: [s.players[0].hand[0].id], now: NOW });
    expect(a.wentOutSeat).toBe(0);
    expect(a.phase).toBe(noDiscardIndex === rs.rounds.length - 1 ? 'game.over' : 'round.over');
  });
  it('no-discard round: END_TURN passes the turn holding cards; not allowed in normal rounds', () => {
    const noDiscardIndex = rs.rounds.findIndex((r) => r.noDiscard);
    const s = playing(rs, [cs('7C', '8C'), cs('KH')], { roundIndex: noDiscardIndex });
    const a = ok(rs, s, { type: 'END_TURN', userId: 'u0', now: NOW });
    expect(a.currentSeat).toBe(1);
    expect(a.phase).toBe('turn.draw');
    expect(a.players[0].hand).toHaveLength(2);
    expect(fail(rs, playing(rs, [cs('7C', '8C'), cs('KH')]), { type: 'END_TURN', userId: 'u0', now: NOW })).toBe('MUST_DISCARD');
  });
  it('no-discard round: laying down the whole hand goes out', () => {
    const noDiscardIndex = rs.rounds.findIndex((r) => r.noDiscard);
    const contract = rs.rounds[noDiscardIndex];
    const groups = contract.melds.map((m, i) =>
      m.kind === 'set' ? cs(...Array(m.size).fill(`${['7', 'K', '3'][i]}H`)) : cs(...['4', '5', '6', '7', '8', '9'].slice(0, m.size).map((r) => `${r}${['S', 'D', 'C'][i]}`)),
    );
    const s = playing(rs, [groups.flat(), cs('KH')], { roundIndex: noDiscardIndex });
    const a = ok(rs, s, { type: 'LAY_DOWN', userId: 'u0', melds: groups.map(ids), now: NOW });
    expect(a.wentOutSeat).toBe(0);
  });
});

describe.each(RULESETS)('timers under %s', (_n, rs) => {
  it('auto-draws from stock when the draw phase times out', () => {
    const s = playing(rs, [cs('3H'), cs('4H')], { phase: 'turn.draw', turnDeadline: NOW + 1000 });
    expect(fail(rs, s, { type: 'TICK', now: NOW })).toBe('NOTHING_TO_DO');
    const a = ok(rs, s, { type: 'TICK', now: NOW + 1000 });
    expect(a.phase).toBe('turn.play');
    expect(a.players[0].hand).toHaveLength(2);
    expect(a.turnDeadline).toBe(NOW + 1000 + rs.turnTimerSeconds * 1000);
  });
  it('auto-discards the highest-scoring card when the play phase times out', () => {
    const s = playing(rs, [cs('3H', 'JOKER', 'KD'), cs('4H')], { turnDeadline: NOW });
    const a = ok(rs, s, { type: 'TICK', now: NOW });
    expect(a.discard[a.discard.length - 1].rank).toBe('JOKER');
    expect(a.currentSeat).toBe(1);
  });
  it('in a no-discard round the timeout just passes the turn', () => {
    const idx = rs.rounds.findIndex((r) => r.noDiscard);
    const s = playing(rs, [cs('3H', 'JOKER'), cs('4H')], { roundIndex: idx, turnDeadline: NOW });
    const a = ok(rs, s, { type: 'TICK', now: NOW });
    expect(a.players[0].hand).toHaveLength(2);
    expect(a.currentSeat).toBe(1);
  });
  it('current player timing out during a buy window resolves it and auto-draws', () => {
    const s = playing(rs, [cs('3H', 'KD'), cs('4H'), cs('5H')]);
    const a = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[1].id, now: NOW });
    if (rs.buysPerRound === 0) return;
    const b = ok(rs, a, { type: 'BUY', userId: 'u2', now: NOW }); // seat 2 holds priority -> immediate
    expect(b.phase).toBe('turn.draw');
    const c1 = ok(rs, b, { type: 'TICK', now: NOW + rs.turnTimerSeconds * 1000 });
    expect(c1.phase).toBe('turn.play');
    expect(c1.currentSeat).toBe(1);
  });
  it('timer off means TICK never fires', () => {
    const rules = { ...rs, turnTimerSeconds: 0 };
    const s = playing(rules, [cs('3H'), cs('4H')], { phase: 'turn.draw', turnDeadline: undefined });
    expect(fail(rules, s, { type: 'TICK', now: NOW + 10_000_000 })).toBe('NOTHING_TO_DO');
  });
});

describe.each(RULESETS)('rounds and scoring under %s', (_n, rs) => {
  it('rotates the dealer and re-deals on NEXT_ROUND; finishes after the last round', () => {
    let s = startedGame(rs, 3);
    s = { ...s, phase: 'round.over' };
    expect(fail(rs, s, { type: 'NEXT_ROUND', userId: 'u1', now: NOW })).toBe('NOT_HOST');
    const a = ok(rs, s, { type: 'NEXT_ROUND', userId: 'u0', now: NOW });
    expect(a.roundIndex).toBe(1);
    expect(a.dealerSeat).toBe(1);
    expect(a.currentSeat).toBe(2);
    expect(a.melds).toEqual([]);
    for (const p of a.players) expect(p.hand).toHaveLength(rs.cardsPerRound);
  });
  it('lowest total wins, ties share', () => {
    const last = rs.rounds.length - 1;
    const s = playing(rs, [cs('3H'), cs('5H'), cs('5H')], { roundIndex: last });
    for (const p of s.players) p.scores = Array(last).fill(10);
    s.players[0].scores[0] = 25; // 0: 25+10*(last-1)+0, 1: 10*last + 5, 2: same as 1
    const contract = rs.rounds[last];
    const a = contract.noDiscard
      ? ok(rs, { ...s, melds: [{ id: 'm', ownerSeat: 1, kind: 'set', rank: '3', cards: cs('3S', '3D', '3C') }], players: s.players.map((p) => ({ ...p, hasLaidDown: true })) }, { type: 'LAY_OFF', userId: 'u0', meldId: 'm', cardIds: [s.players[0].hand[0].id], now: NOW })
      : ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[0].id, now: NOW });
    expect(a.phase).toBe('game.over');
    const totals = a.players.map((p) => p.scores.reduce((x, y) => x + y, 0));
    const best = Math.min(...totals);
    expect(a.winnerSeats).toEqual(a.players.filter((_, i) => totals[i] === best).map((p) => p.seat));
    if (last >= 2) expect(a.winnerSeats).toEqual([1, 2]);
  });
});

describe('misc', () => {
  const rs = houseDefault();
  it('reorders a hand', () => {
    const s = playing(rs, [cs('3H', '4H', '5H'), cs('KH')]);
    const rev = ids(s.players[0].hand).reverse();
    const a = ok(rs, s, { type: 'REORDER_HAND', userId: 'u0', cardIds: rev });
    expect(ids(a.players[0].hand)).toEqual(rev);
    expect(fail(rs, s, { type: 'REORDER_HAND', userId: 'u0', cardIds: rev.slice(1) })).toBe('CARD_NOT_IN_HAND');
  });
  it('connection flags', () => {
    const s = playing(rs, [cs('3H'), cs('KH')]);
    const a = ok(rs, s, { type: 'DISCONNECT', userId: 'u1' });
    expect(a.players[1].connected).toBe(false);
    expect(ok(rs, a, { type: 'RECONNECT', userId: 'u1' }).players[1].connected).toBe(true);
    expect(fail(rs, s, { type: 'RECONNECT', userId: 'nobody' })).toBe('NOT_A_PLAYER');
  });
  it('views hide other hands and the stock', () => {
    const s = playing(rs, [cs('3H', '4H'), cs('KH')]);
    const pub = toPublicState(s);
    expect((pub as unknown as { stock?: unknown }).stock).toBeUndefined();
    expect(pub.stockCount).toBe(s.stock.length);
    expect((pub.players[0] as unknown as { hand?: unknown }).hand).toBeUndefined();
    expect(pub.players[0].handCount).toBe(2);
    const v = toPlayerView(s, 'u1');
    expect(v.mySeat).toBe(1);
    expect(v.myHand.map((x) => x.rank)).toEqual(['K']);
    expect(toPlayerView(s, null).mySeat).toBeNull();
  });
  it('does not mutate the previous state', () => {
    const s = playing(rs, [cs('3H', '4H'), cs('KH')]);
    const before = JSON.stringify(s);
    ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[0].id, now: NOW });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe.each(RULESETS)('full game simulation under %s', (_n, rs) => {
  it('plays every round to completion with a naive bot', () => {
    let s = startedGame(rs, 4, 'sim');
    let steps = 0;
    while (s.phase !== 'game.over' && steps < 50_000) {
      steps++;
      const now = NOW + steps * 1000;
      if (s.phase === 'round.over') {
        s = ok(rs, s, { type: 'NEXT_ROUND', userId: 'u0', now });
        continue;
      }
      const cur = s.players[s.currentSeat];
      if (s.phase === 'buy.window') {
        // Sometimes buy, sometimes let it time out.
        const buyer = s.buyWindow!.order[s.buyWindow!.index];
        if (steps % 3 === 0) s = ok(rs, s, { type: 'BUY', userId: `u${buyer}`, now });
        else s = ok(rs, s, { type: 'DRAW_STOCK', userId: cur.userId, now });
        continue;
      }
      if (s.phase === 'turn.draw') {
        s = ok(rs, s, steps % 2 ? { type: 'DRAW_STOCK', userId: cur.userId, now } : { type: 'TICK', now: s.turnDeadline ?? now });
        continue;
      }
      if (s.phase === 'turn.play') {
        const contract = rs.rounds[s.roundIndex];
        let me = s.players[s.currentSeat];
        if (!me.hasLaidDown) {
          const groups = findContractMelds(me.hand, contract, rs);
          if (groups && (contract.noDiscard || groups.flat().length < me.hand.length)) {
            s = ok(rs, s, { type: 'LAY_DOWN', userId: me.userId, melds: groups.map(ids), now });
            if (s.phase !== 'turn.play') continue;
            me = s.players[s.currentSeat];
          }
        }
        if (me.hasLaidDown) {
          for (const lo of findLayOffs(me.hand, s.melds, rs, contract.noDiscard ? 0 : 1)) {
            s = ok(rs, s, { type: 'LAY_OFF', userId: me.userId, ...lo, now });
            if (s.phase !== 'turn.play') break;
          }
          if (s.phase !== 'turn.play') continue;
          me = s.players[s.currentSeat];
        }
        if (contract.noDiscard) {
          s = ok(rs, s, { type: 'END_TURN', userId: me.userId, now });
        } else if (steps % 5 === 0) {
          s = ok(rs, s, { type: 'TICK', now: s.turnDeadline ?? now });
        } else {
          s = ok(rs, s, { type: 'DISCARD', userId: me.userId, cardId: me.hand[me.hand.length - 1].id, now });
        }
        continue;
      }
      throw new Error(`unexpected phase ${s.phase}`);
    }
    expect(s.phase).toBe('game.over');
    expect(s.winnerSeats!.length).toBeGreaterThan(0);
    for (const p of s.players) expect(p.scores).toHaveLength(rs.rounds.length);
    // Card conservation: every card is in exactly one place at the end.
    const total = rs.decks * (52 + rs.jokersPerDeck);
    const all = [...s.stock, ...s.discard, ...s.players.flatMap((p) => p.hand), ...s.melds.flatMap((m) => m.cards)];
    expect(all).toHaveLength(total);
    expect(new Set(all.map((x) => x.id)).size).toBe(total);
  });
});
