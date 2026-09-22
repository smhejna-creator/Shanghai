import { describe, expect, it } from 'vitest';
import { classic2sWild, houseDefault } from '../ruleset';
import { buildRun, buildSet, layOffCards, replaceWildInRun, validateRunOrder, type Meld, type RunMeld } from '../melds';
import { c, cs, customRules, RULESETS } from './helpers';

const W = (rs = houseDefault()) => c(rs.wilds.ranks[0] ? `${rs.wilds.ranks[0]}C` : 'JOKER');

describe.each(RULESETS)('sets under %s', (_n, rs) => {
  it('accepts three of a kind across suits', () => {
    const r = buildSet(cs('7H', '7S', '7D'), rs);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.rank).toBe('7');
  });
  it('accepts duplicates of the same suit (multiple decks)', () => {
    expect(buildSet(cs('KH', 'KH', 'KH'), rs).ok).toBe(true);
  });
  it('rejects fewer than 3', () => {
    expect(buildSet(cs('7H', '7S'), rs).ok).toBe(false);
  });
  it('rejects mixed ranks', () => {
    expect(buildSet(cs('7H', '7S', '8D'), rs).ok).toBe(false);
  });
  it('allows wilds up to half', () => {
    expect(buildSet([...cs('7H', '7S'), c('JOKER')], rs).ok).toBe(true);
    expect(buildSet([...cs('7H', '7S'), c('JOKER'), c('JOKER')], rs).ok).toBe(true);
    expect(buildSet([...cs('7H'), c('JOKER'), c('JOKER')], rs).ok).toBe(false);
    expect(buildSet([c('JOKER'), c('JOKER'), c('JOKER')], rs).ok).toBe(false);
  });
  it('treats wild-rank cards as wilds, not naturals', () => {
    const wr = rs.wilds.ranks[0];
    expect(buildSet(cs(`${wr}H`, `${wr}S`, `${wr}D`), rs).ok).toBe(false);
    expect(buildSet(cs('9H', '9S', `${wr}D`), rs).ok).toBe(true);
  });
});

describe.each(RULESETS)('runs under %s', (_n, rs) => {
  it('accepts a natural run in any order', () => {
    const r = buildRun(cs('6H', '4H', '5H', '7H'), rs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.cards.map((x) => x.rank)).toEqual(['4', '5', '6', '7']);
      expect(r.value.lowValue).toBe(4);
      expect(r.value.suit).toBe('H');
    }
  });
  it('rejects fewer than 4, mixed suits, and gaps', () => {
    expect(buildRun(cs('4H', '5H', '6H'), rs).ok).toBe(false);
    expect(buildRun(cs('4H', '5H', '6S', '7H'), rs).ok).toBe(false);
    expect(buildRun(cs('4H', '5H', '7H', '8H'), rs).ok).toBe(false);
    expect(buildRun(cs('4H', '4H', '5H', '6H'), rs).ok).toBe(false);
  });
  it('fills a gap with a wild', () => {
    const r = buildRun([...cs('4H', '5H', '7H'), c('JOKER')], rs);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cards[2].rank).toBe('JOKER');
  });
  it('rejects two adjacent wilds and too many wilds', () => {
    expect(buildRun([...cs('4H', '5H', '8H'), c('JOKER'), c('JOKER')], rs).ok).toBe(false);
    expect(buildRun([...cs('4H', '5H'), c('JOKER'), c('JOKER'), c('JOKER')], rs).ok).toBe(false);
    expect(validateRunOrder([c('4H'), c('JOKER'), c('JOKER'), c('7H')], rs).ok).toBe(false);
  });
  it('puts spare wilds on the ends', () => {
    const r = buildRun([...cs('4H', '5H', '6H'), c('JOKER'), c('JOKER')], rs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.cards[0].rank).toBe('JOKER');
      expect(r.value.cards[4].rank).toBe('JOKER');
      expect(r.value.lowValue).toBe(3);
    }
  });
  it('never wraps around K-A-2', () => {
    expect(buildRun(cs('QH', 'KH', 'AH', '3H'), rs).ok).toBe(false);
    expect(buildRun(cs('KH', 'AH', '3H', '4H'), rs).ok).toBe(false);
  });
  it('validates an explicit order', () => {
    expect(validateRunOrder(cs('4H', '5H', '6H', '7H'), rs).ok).toBe(true);
    expect(validateRunOrder(cs('5H', '4H', '6H', '7H'), rs).ok).toBe(false);
  });
});

describe('aces', () => {
  it('either: A-2-3-4 and J-Q-K-A both legal', () => {
    const rs = houseDefault();
    expect(buildRun(cs('AH', '2H', '3H', '4H'), rs).ok).toBe(true);
    expect(buildRun(cs('JH', 'QH', 'KH', 'AH'), rs).ok).toBe(true);
    const low = buildRun(cs('AH', '2H', '3H', '4H'), rs);
    if (low.ok) expect(low.value.lowValue).toBe(1);
    const high = buildRun(cs('JH', 'QH', 'KH', 'AH'), rs);
    if (high.ok) expect(high.value.lowValue).toBe(11);
  });
  it('low: A-2-3-4 legal, J-Q-K-A illegal', () => {
    const rs = classic2sWild();
    expect(buildRun([c('AH'), c('JOKER'), c('3H'), c('4H')], rs).ok).toBe(true);
    expect(buildRun(cs('AH', '3H', '4H', '5H'), rs).ok).toBe(false);
    expect(buildRun(cs('AH', '2H', '3H', '4H'), rs).ok).toBe(true);
    expect(buildRun(cs('JH', 'QH', 'KH', 'AH'), rs).ok).toBe(false);
  });
  it('high: J-Q-K-A legal, A-2-3-4 illegal', () => {
    const rs = customRules();
    expect(buildRun(cs('JH', 'QH', 'KH', 'AH'), rs).ok).toBe(true);
    expect(buildRun(cs('AH', '3H', '4H', '5H'), rs).ok).toBe(false);
  });
  it('either: a wild may stand for a high ace after K but not beyond', () => {
    const rs = houseDefault();
    const r = buildRun([...cs('JH', 'QH', 'KH'), c('JOKER')], rs);
    expect(r.ok).toBe(true);
    expect(buildRun([...cs('QH', 'KH', 'AH'), c('JOKER')], rs).ok).toBe(true); // wild goes low as J
    expect(buildRun([...cs('KH', 'AH'), c('JOKER'), c('JOKER')], rs).ok).toBe(false); // wilds J, Q would be adjacent
  });
  it('low: a wild cannot extend past K', () => {
    const rs = classic2sWild();
    expect(buildRun([...cs('JH', 'QH', 'KH'), c('JOKER')], rs).ok).toBe(true); // goes low as 10
    const r = buildRun([...cs('JH', 'QH', 'KH'), c('JOKER')], rs);
    if (r.ok) expect(r.value.lowValue).toBe(10);
  });
});

describe.each(RULESETS)('lay off under %s', (_n, rs) => {
  const set: Meld = { id: 'm1', ownerSeat: 0, kind: 'set', rank: '7', cards: cs('7H', '7S', '7D') };
  const run: RunMeld = { id: 'm2', ownerSeat: 0, kind: 'run', suit: 'H', lowValue: 4, cards: cs('4H', '5H', '6H', '7H') };
  it('adds matching rank or wild to a set', () => {
    expect(layOffCards(set, cs('7C'), rs).ok).toBe(true);
    expect(layOffCards(set, [c('JOKER')], rs).ok).toBe(true);
    expect(layOffCards(set, cs('8C'), rs).ok).toBe(false);
    expect(layOffCards(set, [c('JOKER'), c('JOKER'), c('JOKER')], rs).ok).toBe(true);
    expect(layOffCards(set, [c('JOKER'), c('JOKER'), c('JOKER'), c('JOKER')], rs).ok).toBe(false);
  });
  it('extends a run at either end', () => {
    const hi = layOffCards(run, cs('8H'), rs);
    expect(hi.ok).toBe(true);
    if (hi.ok && hi.value.kind === 'run') expect(hi.value.cards.map((x) => x.rank)).toEqual(['4', '5', '6', '7', '8']);
    const lo = layOffCards(run, cs('3H'), rs);
    expect(lo.ok).toBe(true);
    if (lo.ok && lo.value.kind === 'run') expect(lo.value.lowValue).toBe(3);
    expect(layOffCards(run, cs('8S'), rs).ok).toBe(false);
    expect(layOffCards(run, cs('9H'), rs).ok).toBe(false);
    expect(layOffCards(run, cs('7H'), rs).ok).toBe(false);
  });
  it('adds several cards at once', () => {
    const r = layOffCards(run, cs('9H', '8H', '3H'), rs);
    expect(r.ok).toBe(true);
    if (r.ok && r.value.kind === 'run') expect(r.value.cards).toHaveLength(7);
  });
  it('adds a wild to the end of a run but not next to another wild', () => {
    const r = layOffCards(run, [c('JOKER')], rs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const again = layOffCards(r.value, [c('JOKER')], rs);
      expect(again.ok).toBe(true); // goes to the other end
      if (again.ok) expect(layOffCards(again.value, [c('JOKER')], rs).ok).toBe(false);
    }
  });
});

describe.each(RULESETS)('wild replacement under %s', (_n, rs) => {
  it('swaps the natural for the wild it stands for', () => {
    const w = c('JOKER');
    const run: RunMeld = { id: 'm2', ownerSeat: 0, kind: 'run', suit: 'H', lowValue: 4, cards: [c('4H'), c('5H'), w, c('7H')] };
    const r = replaceWildInRun(run, w.id, c('6H'), rs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.wild.id).toBe(w.id);
      expect(r.value.meld.cards[2].rank).toBe('6');
    }
    expect(replaceWildInRun(run, w.id, c('6S'), rs).ok).toBe(false);
    expect(replaceWildInRun(run, w.id, c('8H'), rs).ok).toBe(false);
    expect(replaceWildInRun(run, run.cards[0].id, c('4H'), rs).ok).toBe(false);
  });
  it('refuses on sets', () => {
    const w = c('JOKER');
    const set: Meld = { id: 'm1', ownerSeat: 0, kind: 'set', rank: '7', cards: [c('7H'), c('7S'), w] };
    expect(replaceWildInRun(set, w.id, c('7D'), rs).ok).toBe(false);
  });
  it('works with a wild-rank card standing in', () => {
    const w = W(rs);
    if (w.rank === 'JOKER') return;
    const run: RunMeld = { id: 'm2', ownerSeat: 0, kind: 'run', suit: 'H', lowValue: 4, cards: [c('4H'), w, c('6H'), c('7H')] };
    expect(replaceWildInRun(run, w.id, c('5H'), rs).ok).toBe(true);
  });
});
