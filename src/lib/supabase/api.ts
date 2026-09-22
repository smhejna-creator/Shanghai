import type { Action, EngineError, RuleSet } from '@/engine/index.ts';
import { supabase } from './client';

export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly version?: number) {
    super(message);
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ActionInput = DistributiveOmit<Extract<Action, { userId: string }>, 'userId' | 'now' | 'botId'> | { type: 'REMOVE_BOT'; botId: string } | { type: 'TICK' };

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('game-action', { body });
  if (error) {
    // supabase-js wraps non-2xx responses; try to read our JSON error body.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = (await ctx.json()) as { error?: EngineError; version?: number };
        if (parsed.error) throw new ApiError(parsed.error.code, parsed.error.message, parsed.version);
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
    }
    throw new ApiError('NETWORK', error.message ?? 'Request failed');
  }
  const res = data as { error?: EngineError; version?: number } & T;
  if (res && res.error) throw new ApiError(res.error.code, res.error.message, res.version);
  return res;
}

export const api = {
  createGame: (ruleSet: RuleSet, name: string) => call<{ gameId: string; joinCode: string }>({ op: 'create', ruleSet, name }),
  joinGame: (joinCode: string, name: string) => call<{ gameId: string; rejoined?: boolean }>({ op: 'join', joinCode, name }),
  action: (gameId: string, action: ActionInput, expectedVersion?: number) =>
    call<{ ok: true; version: number }>({ op: 'action', gameId, action, expectedVersion }),

  lookupGame: async (code: string) => {
    const { data, error } = await supabase.rpc('lookup_game', { code });
    if (error) throw new ApiError('LOOKUP', error.message);
    return (data as { id: string; status: string; host_name: string; player_count: number; ruleset_name: string }[])[0] ?? null;
  },
  myGames: async () => {
    const { data, error } = await supabase.rpc('my_games');
    if (error) throw new ApiError('LIST', error.message);
    return (data ?? []) as { id: string; join_code: string; status: string; ruleset_name: string; updated_at: string }[];
  },

  savedRuleSets: async () => {
    const { data, error } = await supabase.from('saved_rulesets').select('id,name,ruleset,updated_at').order('updated_at', { ascending: false });
    if (error) throw new ApiError('RULESETS', error.message);
    return (data ?? []) as { id: string; name: string; ruleset: RuleSet; updated_at: string }[];
  },
  saveRuleSet: async (ownerId: string, name: string, ruleset: RuleSet, id?: string) => {
    const row = { owner_id: ownerId, name, ruleset: { ...ruleset, name }, updated_at: new Date().toISOString() };
    const q = id ? supabase.from('saved_rulesets').update(row).eq('id', id) : supabase.from('saved_rulesets').insert(row);
    const { error } = await q;
    if (error) throw new ApiError('SAVE', error.message);
  },
  deleteRuleSet: async (id: string) => {
    const { error } = await supabase.from('saved_rulesets').delete().eq('id', id);
    if (error) throw new ApiError('DELETE', error.message);
  },
  profile: async (userId: string) => {
    const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
    return (data as { display_name: string } | null)?.display_name ?? '';
  },
  setDisplayName: async (userId: string, name: string) => {
    await supabase.from('profiles').upsert({ id: userId, display_name: name });
  },
};
