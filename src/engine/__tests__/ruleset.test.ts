import { describe, expect, it } from 'vitest';
import { classic2sWild, contractName, houseDefault, suggestedDecks, validateRuleSet } from '../ruleset.ts';
import { customRules, RULESETS } from './helpers.ts';

describe('ruleset presets', () => {
  it('house default matches the spec', () => {
    const rs = houseDefault();
    expect(rs.players).toEqual({ min: 2, max: 6 });
    expect(rs.decks).toBe(2);
    expect(rs.jokersPerDeck * rs.decks).toBe(4);
    expect(rs.wilds.ranks).toEqual(['10']);
    expect(rs.rounds).toHaveLength(7);
    expect(rs.rounds[6].noDiscard).toBe(true);
    expect(rs.rounds.slice(0, 6).every((r) => !r.noDiscard)).toBe(true);
    expect(rs.cardsPerRound).toBe(11);
    expect(rs.buysPerRound).toBe(3);
    expect(rs.acesHighLow).toBe('either');
    expect(rs.turnTimerSeconds).toBe(90);
    expect(rs.scoring).toEqual({ numberCards: 'faceValue', faceCards: 10, ace: 15, joker: 50, wildRank: 20 });
  });
  it('classic 2s wild differs only where expected', () => {
    const rs = classic2sWild();
    expect(rs.wilds.ranks).toEqual(['2']);
    expect(rs.acesHighLow).toBe('low');
    expect(rs.buysPerRound).toBe(2);
    expect(rs.rounds.map((r) => r.name)).toEqual(houseDefault().rounds.map((r) => r.name));
  });
  it('names contracts', () => {
    expect(contractName([{ kind: 'set', size: 3 }, { kind: 'set', size: 3 }])).toBe('two sets of 3');
    expect(contractName([{ kind: 'set', size: 3 }, { kind: 'run', size: 4 }])).toBe('one set of 3, one run of 4');
  });
  it('suggests 3 decks at 5+ players', () => {
    expect(suggestedDecks(4)).toBe(2);
    expect(suggestedDecks(5)).toBe(3);
  });
  it.each(RULESETS)('%s validates', (_n, rs) => {
    expect(validateRuleSet(rs)).toEqual([]);
  });
  it('rejects bad rule sets', () => {
    const rs = customRules();
    expect(validateRuleSet({ ...rs, rounds: [] })).toContain('At least one round is required');
    expect(validateRuleSet({ ...rs, players: { min: 1, max: 6 } }).length).toBeGreaterThan(0);
    expect(validateRuleSet({ ...rs, players: { min: 2, max: 7 } }).length).toBeGreaterThan(0);
    expect(validateRuleSet({ ...rs, decks: 0 }).length).toBeGreaterThan(0);
    expect(validateRuleSet({ ...rs, turnTimerSeconds: 5 }).length).toBeGreaterThan(0);
    expect(validateRuleSet({ ...rs, turnTimerSeconds: 0 })).toEqual([]);
    const badMeld = { ...rs, rounds: [{ ...rs.rounds[0], melds: [{ kind: 'set' as const, size: 2 }] }] };
    expect(validateRuleSet(badMeld).join()).toMatch(/sets must be at least 3/);
    const badRun = { ...rs, rounds: [{ ...rs.rounds[0], melds: [{ kind: 'run' as const, size: 3 }] }] };
    expect(validateRuleSet(badRun).join()).toMatch(/runs must be/);
    const tooBig = { ...rs, rounds: [{ ...rs.rounds[0], melds: [{ kind: 'run' as const, size: 13 }, { kind: 'run' as const, size: 13 }] }] };
    expect(validateRuleSet(tooBig).join()).toMatch(/more cards than a player can hold/);
    expect(validateRuleSet({ ...rs, decks: 1, players: { min: 2, max: 6 }, cardsPerRound: 11 }).join()).toMatch(/Not enough cards/);
  });
});
