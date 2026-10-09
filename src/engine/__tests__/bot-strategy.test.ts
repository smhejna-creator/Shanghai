import { describe, expect, it } from 'vitest';
import { chooseDiscard, handValue, wantsDiscard, wantsToBuy } from '../bot.ts';
import { houseDefault } from '../ruleset.ts';
import type { SetMeld } from '../melds.ts';
import { c, cs } from './helpers.ts';

const rs = houseDefault();
const setsContract = rs.rounds[0]; // two sets of 3
const runsContract = rs.rounds[2]; // two runs of 4

describe('bot hand evaluation', () => {
  it('values pairs and triples more when the contract needs sets', () => {
    const hand = cs('7H', '7S', 'KD', 'KC', 'KS');
    expect(handValue(hand, setsContract, rs)).toBeGreaterThan(handValue(hand, runsContract, rs));
  });
  it('values suited sequences more when the contract needs runs', () => {
    const hand = cs('4H', '5H', '6H', '9S', 'JS');
    expect(handValue(hand, runsContract, rs)).toBeGreaterThan(handValue(hand, setsContract, rs));
  });
  it('counts wilds as strong', () => {
    expect(handValue([c('JOKER')], setsContract, rs)).toBeGreaterThan(handValue(cs('3H'), setsContract, rs));
  });
});

describe('bot draw and buy decisions', () => {
  it('takes a discard that completes the contract', () => {
    const hand = cs('7H', '7S', 'KD', 'KC', 'KS', '2C', '9D');
    expect(wantsDiscard(c('7D'), hand, setsContract, rs, false, [])).toBe(true);
  });
  it('takes a discard that turns a pair into a triple, ignores junk', () => {
    const hand = cs('7H', '7S', 'KD', '3C', '9D');
    expect(wantsDiscard(c('7D'), hand, setsContract, rs, false, [])).toBe(true);
    expect(wantsDiscard(c('QC'), hand, setsContract, rs, false, [])).toBe(false);
  });
  it('after laying down, only takes a discard it can lay off', () => {
    const set: SetMeld = { id: 'm', ownerSeat: 1, kind: 'set', rank: '7', cards: cs('7H', '7S', '7D') };
    const hand = cs('3C', '9D');
    expect(wantsDiscard(c('7C'), hand, setsContract, rs, true, [set])).toBe(true);
    expect(wantsDiscard(c('8C'), hand, setsContract, rs, true, [set])).toBe(false);
  });
  it('buys wilds and contract-completing cards, passes on marginal gains when penalty cards are steep', () => {
    const hand = cs('7H', '7S', 'KD', 'KC', 'KS', '2C', '9D');
    expect(wantsToBuy(c('JOKER'), hand, setsContract, rs, 3, 1)).toBe(true);
    expect(wantsToBuy(c('7D'), hand, setsContract, rs, 3, 1)).toBe(true);
    expect(wantsToBuy(c('2D'), hand, setsContract, rs, 3, 3)).toBe(false);
    expect(wantsToBuy(c('JOKER'), hand, setsContract, rs, 0, 1)).toBe(false);
  });
});

describe('bot discards', () => {
  it('never discards a wild and keeps pairs', () => {
    const hand = [...cs('7H', '7S', 'KD', '3C'), c('JOKER')];
    const d = chooseDiscard(hand, setsContract, rs, []);
    expect(d.rank).not.toBe('JOKER');
    expect(d.rank).not.toBe('7');
  });
  it('prefers dumping high-point loose cards', () => {
    const hand = cs('7H', '7S', 'KD', '3C');
    expect(chooseDiscard(hand, setsContract, rs, []).rank).toBe('K');
  });
  it('avoids discarding a card that lays off onto a table meld', () => {
    const set: SetMeld = { id: 'm', ownerSeat: 1, kind: 'set', rank: 'K', cards: cs('KH', 'KS', 'KC') };
    const hand = cs('7H', '7S', 'KD', 'QC');
    expect(chooseDiscard(hand, setsContract, rs, [set]).rank).toBe('Q');
  });
});
