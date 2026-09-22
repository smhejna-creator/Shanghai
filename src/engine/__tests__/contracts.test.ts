import { describe, expect, it } from 'vitest';
import { matchContract } from '../contracts';
import { houseDefault } from '../ruleset';
import { c, cs, customRules, RULESETS } from './helpers';

describe('contracts (house default)', () => {
  const rs = houseDefault();
  const rounds = rs.rounds;
  it('round 1: two sets of 3', () => {
    expect(matchContract([cs('7H', '7S', '7D'), cs('KH', 'KS', 'KC')], rounds[0], rs).ok).toBe(true);
    expect(matchContract([cs('7H', '7S', '7D')], rounds[0], rs).ok).toBe(false);
    expect(matchContract([cs('7H', '7S', '7D'), cs('4H', '5H', '6H', '7H')], rounds[0], rs).ok).toBe(false);
  });
  it('round 2: one set + one run in either order', () => {
    expect(matchContract([cs('7H', '7S', '7D'), cs('4H', '5H', '6H', '7H')], rounds[1], rs).ok).toBe(true);
    expect(matchContract([cs('4H', '5H', '6H', '7H'), cs('7H', '7S', '7D')], rounds[1], rs).ok).toBe(true);
    expect(matchContract([cs('4H', '5H', '6H', '7H'), cs('4S', '5S', '6S', '7S')], rounds[1], rs).ok).toBe(false);
  });
  it('round 3: two runs of 4', () => {
    expect(matchContract([cs('4H', '5H', '6H', '7H'), cs('9S', '10S', 'JS', 'QS')], rounds[2], rs).ok).toBe(true);
    expect(matchContract([cs('4H', '5H', '6H', '7H'), cs('9S', '8S', 'JS', 'QS')], rounds[2], rs).ok).toBe(false);
  });
  it('round 4: three sets', () => {
    expect(matchContract([cs('7H', '7S', '7D'), cs('KH', 'KS', 'KC'), cs('3H', '3S', '3C')], rounds[3], rs).ok).toBe(true);
  });
  it('round 7: three runs', () => {
    expect(
      matchContract([cs('4H', '5H', '6H', '7H'), cs('8S', '9S', '10S', 'JS'), cs('AD', '2D', '3D', '4D')], rounds[6], rs).ok,
    ).toBe(true);
  });
  it('melds may exceed the minimum size', () => {
    expect(matchContract([cs('7H', '7S', '7D', '7C'), cs('KH', 'KS', 'KC')], rounds[0], rs).ok).toBe(true);
    expect(matchContract([cs('4H', '5H', '6H', '7H', '8H', '9H'), cs('7H', '7S', '7D')], rounds[1], rs).ok).toBe(true);
  });
  it('the same card cannot appear twice', () => {
    const seven = c('7H');
    expect(matchContract([[seven, c('7S'), c('7D')], [seven, c('7C'), c('7H')]], rounds[0], rs).ok).toBe(false);
  });
  it('wilds count toward melds', () => {
    expect(matchContract([[c('7H'), c('7S'), c('JOKER')], [c('KH'), c('10D'), c('KC')]], rounds[0], rs).ok).toBe(true);
  });
});

describe('custom contracts', () => {
  const rs = customRules();
  it('round 1: two sets of 4', () => {
    expect(matchContract([cs('7H', '7S', '7D', '7C'), cs('KH', 'KS', 'KC', 'KD')], rs.rounds[0], rs).ok).toBe(true);
    expect(matchContract([cs('7H', '7S', '7D'), cs('KH', 'KS', 'KC', 'KD')], rs.rounds[0], rs).ok).toBe(false);
  });
  it('round 2: one run of 5', () => {
    expect(matchContract([cs('4H', '5H', '6H', '7H', '8H')], rs.rounds[1], rs).ok).toBe(true);
    expect(matchContract([cs('4H', '5H', '6H', '7H')], rs.rounds[1], rs).ok).toBe(false);
    // 2s are wild in this rule set, so a 2 cannot be natural.
    expect(matchContract([cs('2H', '3H', '4H', '5H', '6H')], rs.rounds[1], rs).ok).toBe(true);
    expect(matchContract([cs('2H', '2S', '4H', '5H', '6H')], rs.rounds[1], rs).ok).toBe(true); // two wilds, three naturals
  });
  it('round 3: set + two runs', () => {
    expect(
      matchContract([cs('4H', '5H', '6H', '7H'), cs('7H', '7S', '7D'), cs('9S', 'JS', 'QS', 'KS')], rs.rounds[2], rs).ok,
    ).toBe(false); // 9-J gap without a wild
    expect(
      matchContract([cs('4H', '5H', '6H', '7H'), cs('7H', '7S', '7D'), [c('9S'), c('JOKER'), c('JS'), c('QS')]], rs.rounds[2], rs).ok,
    ).toBe(true);
  });
});

describe.each(RULESETS)('contract matching is rule-set aware: %s', (_n, rs) => {
  it('respects the wild rank', () => {
    const wr = rs.wilds.ranks[0];
    const contract = { id: 'x', name: 'set', melds: [{ kind: 'set' as const, size: 3 }], noDiscard: false };
    expect(matchContract([cs(`${wr}H`, `${wr}S`, `${wr}D`)], contract, rs).ok).toBe(false);
    expect(matchContract([cs('9H', '9S', `${wr}D`)], contract, rs).ok).toBe(true);
  });
});
