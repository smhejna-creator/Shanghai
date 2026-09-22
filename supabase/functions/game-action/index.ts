// Shanghai: server-authoritative game actions.
// Every client action is validated with the same pure engine used in the browser.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  botAction,
  createGame,
  reduce,
  toPublicState,
  validateRuleSet,
  type Action,
  type Card,
  type GameState,
  type PlayerState,
  type PublicState,
  type RuleSet,
} from '../_shared/engine/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TICK_SECRET = Deno.env.get('GAME_TICK_SECRET') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tick-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = (): SupabaseClient => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type GameRow = { id: string; join_code: string; host_id: string; status: string; ruleset: RuleSet; public_state: PublicState; version: number };
type HandRow = { seat: number; user_id: string; cards: Card[] };

async function loadGame(db: SupabaseClient, gameId: string): Promise<{ row: GameRow; state: GameState } | null> {
  const { data: row } = await db.from('games').select('*').eq('id', gameId).maybeSingle<GameRow>();
  if (!row) return null;
  const [{ data: hands }, { data: secrets }] = await Promise.all([
    db.from('game_hands').select('seat,user_id,cards').eq('game_id', gameId),
    db.from('game_secrets').select('stock,rng_seed').eq('game_id', gameId).maybeSingle<{ stock: Card[]; rng_seed: string }>(),
  ]);
  const handBySeat = new Map<number, Card[]>((hands as HandRow[] | null)?.map((h) => [h.seat, h.cards]) ?? []);
  const { stockCount: _sc, players, ...rest } = row.public_state;
  const state: GameState = {
    ...rest,
    stock: secrets?.stock ?? [],
    rngSeed: secrets?.rng_seed ?? rest.rngSeed,
    players: players.map(({ handCount: _hc, ...p }): PlayerState => ({ ...p, hand: handBySeat.get(p.seat) ?? [] })),
  };
  return { row, state };
}

function statusOf(state: GameState): string {
  if (state.phase === 'lobby') return 'lobby';
  if (state.phase === 'game.over') return 'finished';
  return 'playing';
}

function deadlineOf(state: GameState): string | null {
  const candidates = [state.turnDeadline, state.buyWindow?.deadline].filter((x): x is number => typeof x === 'number');
  if (candidates.length === 0 || state.phase === 'round.over' || state.phase === 'game.over' || state.phase === 'lobby') return null;
  return new Date(Math.min(...candidates)).toISOString();
}

async function writeGame(db: SupabaseClient, gameId: string, expectedVersion: number, state: GameState, ruleSet: RuleSet, action: Action): Promise<boolean> {
  const pub = toPublicState(state);
  const { data, error } = await db.rpc('apply_game_update', {
    p_game_id: gameId,
    p_expected_version: expectedVersion,
    p_new_version: state.version,
    p_status: statusOf(state),
    p_ruleset: ruleSet,
    p_public_state: pub,
    p_deadline: deadlineOf(state),
    p_hands: state.players.map((p) => ({ seat: p.seat, user_id: p.userId, cards: p.hand })),
    p_players: state.players.map((p) => ({ seat: p.seat, user_id: p.userId, display_name: p.name, is_ready: p.ready, connected: p.connected })),
    p_stock: state.stock,
    p_event: action,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/** Let bots act until a human is needed (or the game pauses). Returns the final state. */
function driveBots(rs: RuleSet, state: GameState): GameState {
  for (let i = 0; i < 200; i++) {
    const a = botAction(rs, state, Date.now());
    if (!a) break;
    const r = reduce(rs, state, a);
    if (!r.ok) {
      console.error('bot action rejected', a.type, r.error);
      break;
    }
    state = r.state;
  }
  return state;
}

/** Apply an action with optimistic-concurrency retries. */
async function applyAction(db: SupabaseClient, gameId: string, makeAction: (state: GameState) => Action, expectedVersion?: number) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const loaded = await loadGame(db, gameId);
    if (!loaded) return json({ error: { code: 'NOT_FOUND', message: 'Game not found' } }, 404);
    if (expectedVersion !== undefined && attempt === 0 && loaded.row.version !== expectedVersion)
      return json({ error: { code: 'STALE', message: 'Your view of the game is out of date' }, version: loaded.row.version }, 409);
    const action = makeAction(loaded.state);
    const result = reduce(loaded.row.ruleset, loaded.state, action);
    if (!result.ok) return json({ error: result.error, version: loaded.row.version }, 400);
    const finalState = driveBots(result.ruleSet, result.state);
    const written = await writeGame(db, gameId, loaded.row.version, finalState, result.ruleSet, action);
    if (written) return json({ ok: true, version: finalState.version });
  }
  return json({ error: { code: 'CONFLICT', message: 'Game changed while processing; try again' } }, 409);
}

function makeJoinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function tick(db: SupabaseClient, gameId: string) {
  // Apply TICKs until the engine reports nothing to do (a timeout may chain into another deadline).
  for (let i = 0; i < 5; i++) {
    const loaded = await loadGame(db, gameId);
    if (!loaded) return json({ error: { code: 'NOT_FOUND', message: 'Game not found' } }, 404);
    const action: Action = { type: 'TICK', now: Date.now() };
    const result = reduce(loaded.row.ruleset, loaded.state, action);
    if (!result.ok) {
      if (result.error.code === 'NOTHING_TO_DO') {
        // A bot may still owe a move (e.g. after a failed write); let it act.
        const driven = driveBots(loaded.row.ruleset, loaded.state);
        if (driven.version !== loaded.state.version) {
          await writeGame(db, gameId, loaded.row.version, driven, loaded.row.ruleset, action);
          return json({ ok: true, ticked: i, bots: true });
        }
        // Clear a stale deadline so pg_cron stops calling us for this game.
        const dl = deadlineOf(loaded.state);
        if (dl === null || new Date(dl).getTime() > Date.now()) {
          await db.from('games').update({ deadline: dl }).eq('id', gameId);
        }
        return json({ ok: true, ticked: i });
      }
      return json({ error: result.error }, 400);
    }
    await writeGame(db, gameId, loaded.row.version, driveBots(loaded.row.ruleset, result.state), result.ruleSet, action);
  }
  return json({ ok: true, ticked: 5 });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: { code: 'METHOD', message: 'POST only' } }, 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: { code: 'BAD_JSON', message: 'Invalid JSON' } }, 400);
  }
  const db = admin();
  const op = body.op as string;

  if (op === 'tick') {
    if (!TICK_SECRET || req.headers.get('x-tick-secret') !== TICK_SECRET)
      return json({ error: { code: 'UNAUTHORIZED', message: 'Bad tick secret' } }, 401);
    if (typeof body.gameId !== 'string') return json({ error: { code: 'BAD_REQUEST', message: 'gameId required' } }, 400);
    try {
      return await tick(db, body.gameId);
    } catch (e) {
      return json({ error: { code: 'SERVER', message: String(e) } }, 500);
    }
  }

  // Everything else needs a signed-in user.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: { code: 'UNAUTHORIZED', message: 'Sign in first' } }, 401);
  const userId = userData.user.id;
  const { data: profile } = await db.from('profiles').select('display_name').eq('id', userId).maybeSingle<{ display_name: string }>();
  const displayName = (typeof body.name === 'string' && body.name.trim()) || profile?.display_name || 'Player';
  if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== profile?.display_name) {
    await db.from('profiles').upsert({ id: userId, display_name: body.name.trim().slice(0, 24) });
  }

  try {
    switch (op) {
      case 'create': {
        const ruleSet = body.ruleSet as RuleSet;
        const problems = validateRuleSet(ruleSet);
        if (problems.length) return json({ error: { code: 'INVALID_RULESET', message: problems.join('; ') } }, 400);
        const seed = crypto.randomUUID();
        const init = reduce(ruleSet, createGame(userId, seed), { type: 'JOIN', userId, name: displayName });
        if (!init.ok) return json({ error: init.error }, 400);
        const state = init.state;
        let joinCode = makeJoinCode();
        let gameId: string | null = null;
        for (let i = 0; i < 5 && !gameId; i++) {
          const { data, error } = await db
            .from('games')
            .insert({ join_code: joinCode, host_id: userId, status: 'lobby', ruleset: ruleSet, public_state: toPublicState(state), version: state.version })
            .select('id')
            .maybeSingle<{ id: string }>();
          if (error) {
            if (error.code === '23505') {
              joinCode = makeJoinCode();
              continue;
            }
            throw new Error(error.message);
          }
          gameId = data!.id;
        }
        if (!gameId) throw new Error('Could not allocate a join code');
        await db.from('game_secrets').insert({ game_id: gameId, stock: [], rng_seed: seed });
        await db.from('game_players').insert({ game_id: gameId, seat: 0, user_id: userId, display_name: displayName, is_ready: false, connected_at: new Date().toISOString() });
        await db.from('game_hands').insert({ game_id: gameId, seat: 0, user_id: userId, cards: [], version: state.version });
        await db.from('game_events').insert({ game_id: gameId, version: state.version, user_id: userId, action: { type: 'JOIN', userId, name: displayName } });
        return json({ ok: true, gameId, joinCode });
      }
      case 'join': {
        const code = String(body.joinCode ?? '').trim().toUpperCase();
        const { data: game } = await db.from('games').select('id,status').eq('join_code', code).maybeSingle<{ id: string; status: string }>();
        if (!game) return json({ error: { code: 'NOT_FOUND', message: 'No game with that code' } }, 404);
        const { data: existing } = await db.from('game_players').select('seat').eq('game_id', game.id).eq('user_id', userId).maybeSingle();
        if (existing) {
          // Rejoin: flag connected.
          await applyAction(db, game.id, () => ({ type: 'RECONNECT', userId }));
          return json({ ok: true, gameId: game.id, rejoined: true });
        }
        if (game.status !== 'lobby') return json({ error: { code: 'WRONG_PHASE', message: 'That game has already started' } }, 400);
        const res = await applyAction(db, game.id, () => ({ type: 'JOIN', userId, name: displayName }));
        if (!res.ok) return res;
        return json({ ok: true, gameId: game.id });
      }
      case 'action': {
        const gameId = body.gameId as string;
        const raw = body.action as Record<string, unknown>;
        if (typeof gameId !== 'string' || !raw || typeof raw.type !== 'string')
          return json({ error: { code: 'BAD_REQUEST', message: 'gameId and action required' } }, 400);
        if (raw.type === 'TICK') {
          // Any member may poke the clock; the server's own time is what counts.
          const { data: member } = await db.from('game_players').select('seat').eq('game_id', gameId).eq('user_id', userId).maybeSingle();
          if (!member) return json({ error: { code: 'NOT_A_PLAYER', message: 'Not in this game' } }, 403);
          return await tick(db, gameId);
        }
        const expectedVersion = typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined;
        // The server stamps identity and time; clients cannot spoof either.
        const action = { ...raw, userId, now: Date.now() } as Action;
        if (action.type === 'ADD_BOT') action.botId = crypto.randomUUID();
        return await applyAction(db, gameId, () => action, expectedVersion);
      }
      default:
        return json({ error: { code: 'BAD_REQUEST', message: `Unknown op ${op}` } }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: { code: 'SERVER', message: String(e) } }, 500);
  }
});
