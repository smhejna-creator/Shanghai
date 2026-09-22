import { describe, expect, it } from 'vitest';
import { findContractMelds, findLayOffs } from '../solver.ts';
import { matchContract } from '../contracts.ts';
import type { SetMeld, RunMeld } from '../melds.ts';
import { c, cs, RULESETS } from './helpers.ts';

describe.each(RULESETS)('solver under %s', (_n, rs) => {
  it('finds round-1 melds in a hand when they exist, and validates them', () => {
    const contract = rs.rounds[0];
    const hand = [...cs('7H', '7S', '7D', '7C', 'KH', 'KS', 'KD', 'KC', '4S', '5S', '6S', '7S', '8S', '9S'), c('JOKER'), c('JOKER')];
    const found = findContractMelds(hand, contract, rs);
    expect(found).not.toBeNull();
    expect(matchContract(found!, contract, rs).ok).toBe(true);
  });
  it('returns null when the contract cannot be met', () => {
    expect(findContractMelds(cs('3H', '5S', '9D', 'KC', 'AH'), rs.rounds[0], rs)).toBeNull();
  });
  it('uses wilds to complete runs', () => {
    const contract = { id: 'x', name: 'run', melds: [{ kind: 'run' as const, size: 4 }], noDiscard: false };
    const found = findContractMelds([...cs('4H', '5H', '7H'), c('JOKER')], contract, rs);
    expect(found).not.toBeNull();
  });
  it('greedy lay-offs keep the requested number of cards', () => {
    const set: SetMeld = { id: 'm1', ownerSeat: 1, kind: 'set', rank: '7', cards: cs('7H', '7S', '7D') };
    const run: RunMeld = { id: 'm2', ownerSeat: 1, kind: 'run', suit: 'H', lowValue: 4, cards: cs('4H', '5H', '6H', '7H') };
    const hand = cs('7C', '8H', '3H', 'KD');
    const plays = findLayOffs(hand, [set, run], rs, 1);
    expect(plays).toHaveLength(3);
    expect(findLayOffs(cs('7C'), [set, run], rs, 1)).toHaveLength(0);
    expect(findLayOffs(cs('7C'), [set, run], rs, 0)).toHaveLength(1);
  });
});
