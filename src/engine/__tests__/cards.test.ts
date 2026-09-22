import { describe, expect, it } from 'vitest';
import { buildDeck, cardScore, handScore, isWild, shuffle } from '../cards';
import { houseDefault } from '../ruleset';
import { c, cs, customRules, RULESETS } from './helpers';

describe.each(RULESETS)('cards under %s', (_n, rs) => {
  it('builds the right number of cards', () => {
    const deck = buildDeck(rs);
    expect(deck).toHaveLength(rs.decks * (52 + rs.jokersPerDeck));
    expect(new Set(deck.map((x) => x.id)).size).toBe(deck.length);
    expect(deck.filter((x) => x.rank === 'JOKER')).toHaveLength(rs.decks * rs.jokersPerDeck);
  });
  it('detects wilds from the rule set', () => {
    expect(isWild(c('JOKER'), rs)).toBe(true);
    for (const r of rs.wilds.ranks) expect(isWild(c(`${r}H`), rs)).toBe(true);
    expect(isWild(c('7H'), rs)).toBe(false);
    expect(isWild(c('KS'), rs)).toBe(false);
  });
  it('scores cards', () => {
    expect(cardScore(c('JOKER'), rs)).toBe(rs.scoring.joker);
    expect(cardScore(c('AS'), rs)).toBe(rs.scoring.ace);
    expect(cardScore(c('KS'), rs)).toBe(rs.scoring.faceCards);
    expect(cardScore(c('QS'), rs)).toBe(rs.scoring.faceCards);
    expect(cardScore(c('JS'), rs)).toBe(rs.scoring.faceCards);
    expect(cardScore(c('7S'), rs)).toBe(7);
    for (const r of rs.wilds.ranks) expect(cardScore(c(`${r}S`), rs)).toBe(rs.scoring.wildRank);
  });
  it('shuffles deterministically by seed', () => {
    const deck = buildDeck(rs);
    expect(shuffle(deck, 'a').map((x) => x.id)).toEqual(shuffle(deck, 'a').map((x) => x.id));
    expect(shuffle(deck, 'a').map((x) => x.id)).not.toEqual(shuffle(deck, 'b').map((x) => x.id));
  });
});

describe('scoring specifics', () => {
  it('10s score 20 when wild, 10 when not', () => {
    expect(cardScore(c('10H'), houseDefault())).toBe(20);
    expect(cardScore(c('10H'), { ...houseDefault(), wilds: { jokers: true, ranks: ['2'] } })).toBe(10);
    expect(cardScore(c('2H'), { ...houseDefault(), wilds: { jokers: true, ranks: ['2'] } })).toBe(20);
  });
  it('sums a hand', () => {
    expect(handScore(cs('AS', 'KH', '7D', 'JOKER', '10C'), houseDefault())).toBe(15 + 10 + 7 + 50 + 20);
    expect(handScore(cs('2S', '10C'), customRules())).toBe(40);
  });
});
