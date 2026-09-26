import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card, GameType, PlayerView, PublicState, RuleSet, SwoopPlayerView, SwoopPublicState, SwoopRuleSet } from '@/engine/index.ts';
import { composeSwoopView, composeView } from '@/engine/index.ts';
import { supabase } from './client';
import { api } from './api';

export type GameData =
  | { gameType: 'shanghai'; view: PlayerView; ruleSet: RuleSet; joinCode: string; status: string }
  | { gameType: 'swoop'; view: SwoopPlayerView; ruleSet: SwoopRuleSet; joinCode: string; status: string };

/** Subscribe to a game: the public row plus this user's own hand. Re-renders from server state only. */
export function useGame(gameId: string | undefined, userId: string | null) {
  const [data, setData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastTick = useRef(0);

  const refresh = useCallback(async () => {
    if (!gameId) return;
    const [{ data: game, error: gErr }, { data: hand }] = await Promise.all([
      supabase.from('games').select('join_code,status,game_type,ruleset,public_state,version').eq('id', gameId).maybeSingle(),
      userId ? supabase.from('game_hands').select('seat,cards').eq('game_id', gameId).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (gErr) {
      setError(gErr.message);
      setLoading(false);
      return;
    }
    if (!game) {
      setError('not-a-member');
      setLoading(false);
      return;
    }
    const g = game as { join_code: string; status: string; game_type: GameType; ruleset: RuleSet | SwoopRuleSet; public_state: PublicState | SwoopPublicState; version: number };
    const h = hand as { seat: number; cards: Card[] } | null;
    const mySeat = g.public_state.players.find((p) => p.userId === userId)?.seat ?? null;
    setData((prev) => {
      // Ignore out-of-order responses.
      if (prev && prev.view.version > g.public_state.version) return prev;
      if (g.game_type === 'swoop') {
        return { gameType: 'swoop', view: composeSwoopView(g.public_state as SwoopPublicState, mySeat, h?.cards ?? []), ruleSet: g.ruleset as SwoopRuleSet, joinCode: g.join_code, status: g.status };
      }
      return { gameType: 'shanghai', view: composeView(g.public_state as PublicState, mySeat, h?.cards ?? []), ruleSet: g.ruleset as RuleSet, joinCode: g.join_code, status: g.status };
    });
    setError(null);
    setLoading(false);
  }, [gameId, userId]);

  useEffect(() => {
    if (!gameId) return;
    setLoading(true);
    refresh();
    const channel = supabase
      .channel(`game:${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_hands', filter: `game_id=eq.${gameId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` }, () => refresh())
      .subscribe();
    const poll = setInterval(refresh, 8000);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [gameId, refresh]);

  // Client-side timer fallback: if a deadline has passed and nothing happened, poke the server clock.
  useEffect(() => {
    if (!data || !gameId) return;
    const v = data.view;
    const deadlines = [v.turnDeadline, data.gameType === 'shanghai' ? data.view.buyWindow?.deadline : undefined].filter((x): x is number => typeof x === 'number');
    if (deadlines.length === 0 || v.phase === 'lobby' || v.phase === 'round.over' || v.phase === 'game.over') return;
    const next = Math.min(...deadlines);
    const delay = Math.max(0, next - Date.now()) + 1500;
    const t = setTimeout(async () => {
      if (Date.now() - lastTick.current < 3000) return;
      lastTick.current = Date.now();
      try {
        await api.action(gameId, { type: 'TICK' });
      } catch {
        /* server may already have ticked; refresh will catch up */
      }
      refresh();
    }, delay);
    return () => clearTimeout(t);
  }, [data, gameId, refresh]);

  return { data, error, loading, refresh };
}
