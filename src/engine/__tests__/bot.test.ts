import { describe, expect, it } from 'vitest';
import { botAction } from '../bot.ts';
import { createGame, reduce } from '../reducer.ts';
import { cs, fail, NOW, ok, playing, RULESETS } from './helpers.ts';

describe.each(RULESETS)('bots under %s', (_n, rs) => {
  it('host adds and removes bots in the lobby; bots are always ready', () => {
    let s = createGame('u0', 'seed');
    s = ok(rs, s, { type: 'JOIN', userId: 'u0', name: 'Host' });
    expect(fail(rs, s, { type: 'ADD_BOT', userId: 'u1', botId: 'b1', name: 'Bot' })).toBe('NOT_HOST');
    s = ok(rs, s, { type: 'ADD_BOT', userId: 'u0', botId: 'b1', name: 'Robo' });
    s = ok(rs, s, { type: 'ADD_BOT', userId: 'u0', botId: 'b2', name: 'Tin' });
    expect(s.players.filter((p) => p.isBot)).toHaveLength(2);
    expect(fail(rs, s, { type: 'LEAVE', userId: 'b1' })).toBe('NOT_A_PLAYER');
    s = ok(rs, s, { type: 'REMOVE_BOT', userId: 'u0', botId: 'b1' });
    expect(s.players.map((p) => [p.userId, p.seat])).toEqual([['u0', 0], ['b2', 1]]);
    s = ok(rs, s, { type: 'START', userId: 'u0', now: NOW });
    expect(s.phase).toBe('turn.draw');
    expect(fail(rs, s, { type: 'ADD_BOT', userId: 'u0', botId: 'b3', name: 'Late' })).toBe('WRONG_PHASE');
  });
  it('a bot draws, plays, and discards on its turn', () => {
    const s = playing(rs, [cs('3H', 'KD', '7S'), cs('4H')], { phase: 'turn.draw' });
    s.players[0].isBot = true;
    const a = botAction(rs, s, NOW)!;
    expect(['DRAW_STOCK', 'DRAW_DISCARD']).toContain(a.type);
    const afterDraw = ok(rs, s, a);
    const b = botAction(rs, afterDraw, NOW)!;
    expect(b.type).toBe('DISCARD');
    const afterDiscard = ok(rs, afterDraw, b);
    expect(afterDiscard.currentSeat).toBe(1);
  });
  it('returns null when no bot needs to act', () => {
    const s = playing(rs, [cs('3H'), cs('4H')]);
    expect(botAction(rs, s, NOW)).toBeNull();
  });
  it('a bot with priority buys a wild and passes junk', () => {
    if (rs.buysPerRound === 0) return;
    const s = playing(rs, [cs('3H', 'KD'), cs('4H'), cs('5H', '9C')]);
    s.players[2].isBot = true;
    const junk = ok(rs, s, { type: 'DISCARD', userId: 'u0', cardId: s.players[0].hand[1].id, now: NOW });
    expect(junk.phase).toBe('buy.window');
    expect(botAction(rs, junk, NOW)?.type).toBe('PASS_BUY');
    const wild = { ...s, players: s.players.map((p, i) => (i === 0 ? { ...p, hand: [...cs('3H'), { id: 'J-x', rank: 'JOKER' as const, suit: 'X' as const, deck: 0 }] } : p)) };
    const withWild = ok(rs, wild, { type: 'DISCARD', userId: 'u0', cardId: 'J-x', now: NOW });
    expect(botAction(rs, withWild, NOW)?.type).toBe('BUY');
  });
  it('bots complete a full game against each other', () => {
    let s = createGame('u0', 'bots');
    s = ok(rs, s, { type: 'JOIN', userId: 'u0', name: 'Host' });
    for (let i = 1; i < 4; i++) s = ok(rs, s, { type: 'ADD_BOT', userId: 'u0', botId: `b${i}`, name: `Bot ${i}` });
    s.players[0].isBot = true; // let the host play as a bot too
    s = ok(rs, s, { type: 'START', userId: 'u0', now: NOW });
    let steps = 0;
    while (s.phase !== 'game.over' && steps++ < 50_000) {
      if (s.phase === 'round.over') {
        s = ok(rs, s, { type: 'NEXT_ROUND', userId: 'u0', now: NOW });
        continue;
      }
      const a = botAction(rs, s, NOW + steps);
      if (!a) throw new Error(`bot stuck in ${s.phase}`);
      const r = reduce(rs, s, a);
      if (!r.ok) throw new Error(`${a.type}: ${r.error.message}`);
      s = r.state;
    }
    expect(s.phase).toBe('game.over');
  });
});
