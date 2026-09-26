import { buildDeck, shuffle, type Card } from '../cards.ts';
import { cardKind, isLegalPlay, legalRanks, topIsFourOfAKind, cardValue } from './rules.ts';
import { cardsPerPlayer, validateSwoopRuleSet, type SwoopRuleSet } from './ruleset.ts';
import type { SwoopAction, SwoopErrorCode, SwoopPlayer, SwoopResult, SwoopState } from './state.ts';

const err = (code: SwoopErrorCode, message: string): SwoopResult => ({ ok: false, error: { code, message } });

export function createSwoopGame(hostUserId: string, rngSeed: string): SwoopState {
  return {
    version: 0,
    phase: 'lobby',
    hostUserId,
    roundIndex: 0,
    dealerSeat: 0,
    currentSeat: 0,
    players: [],
    stock: [],
    pile: [],
    cleared: [],
    sevenActive: false,
    finishedCount: 0,
    rngSeed,
    log: [],
  };
}

function log(state: SwoopState, msg: string) {
  state.log = [...state.log.slice(-29), msg];
}
function byUser(state: SwoopState, userId: string) {
  return state.players.find((p) => p.userId === userId);
}
function deadline(rs: SwoopRuleSet, now: number, seconds = rs.turnTimerSeconds): number | undefined {
  return seconds > 0 ? now + seconds * 1000 : undefined;
}
function nextActiveSeat(state: SwoopState, from: number): number {
  const n = state.players.length;
  for (let k = 1; k <= n; k++) {
    const s = (from + k) % n;
    if (state.players[s].finished === undefined) return s;
  }
  return from;
}
function makePlayer(seat: number, userId: string, name: string, isBot = false): SwoopPlayer {
  return { seat, userId, name, hand: [], faceUp: [], faceDown: [], doneSwapping: false, scores: [], ready: isBot, connected: true, isBot: isBot || undefined };
}

export type Source = 'hand' | 'faceUp' | 'faceDown' | 'none';
export function playSource(p: SwoopPlayer): Source {
  if (p.hand.length) return 'hand';
  if (p.faceUp.length) return 'faceUp';
  if (p.faceDown.length) return 'faceDown';
  return 'none';
}

function deal(state: SwoopState, rs: SwoopRuleSet, now: number) {
  const deck = shuffle(buildDeck({ decks: rs.decks, jokersPerDeck: rs.jokersPerDeck } as never), `${state.rngSeed}:swoop:${state.roundIndex}`);
  state.stock = deck;
  state.pile = [];
  state.cleared = [];
  state.sevenActive = false;
  state.finishedCount = 0;
  for (const p of state.players) {
    p.hand = [];
    p.faceUp = [];
    p.faceDown = [];
    p.doneSwapping = !rs.swapPhase || rs.faceUp === 0;
    p.finished = undefined;
  }
  const order = state.players.map((_, i) => (state.dealerSeat + 1 + i) % state.players.length);
  for (let i = 0; i < rs.faceDown; i++) for (const s of order) state.players[s].faceDown.push(state.stock.pop()!);
  for (let i = 0; i < rs.faceUp; i++) for (const s of order) state.players[s].faceUp.push(state.stock.pop()!);
  for (let i = 0; i < rs.handSize; i++) for (const s of order) state.players[s].hand.push(state.stock.pop()!);
  state.currentSeat = order[0];
  if (state.players.every((p) => p.doneSwapping)) {
    state.phase = 'turn';
    state.turnDeadline = deadline(rs, now);
  } else {
    state.phase = 'swap';
    state.turnDeadline = deadline(rs, now, rs.swapTimerSeconds);
  }
  log(state, `Round ${state.roundIndex + 1} dealt. ${state.players[state.dealerSeat].name} deals; ${state.players[order[0]].name} leads.`);
}

function startTurns(state: SwoopState, rs: SwoopRuleSet, now: number) {
  state.phase = 'turn';
  state.turnDeadline = deadline(rs, now);
}

function refill(state: SwoopState, rs: SwoopRuleSet, p: SwoopPlayer) {
  while (p.hand.length < rs.refillTo && state.stock.length > 0) p.hand.push(state.stock.pop()!);
}

function endRound(state: SwoopState, rs: SwoopRuleSet) {
  const n = state.players.length;
  for (const p of state.players) {
    if (p.finished === undefined) p.finished = n - 1; // the loser
    p.scores[state.roundIndex] = p.finished;
  }
  state.turnDeadline = undefined;
  const loser = state.players.find((p) => p.finished === n - 1);
  log(state, `${loser?.name} is stuck with the cards. Round over.`);
  if (state.roundIndex >= rs.rounds - 1) {
    state.phase = 'game.over';
    const totals = state.players.map((p) => p.scores.reduce((a, b) => a + b, 0));
    const best = Math.min(...totals);
    state.winnerSeats = state.players.filter((_, i) => totals[i] === best).map((p) => p.seat);
    log(state, `Game over. Winner: ${state.winnerSeats.map((s) => state.players[s].name).join(', ')}`);
  } else {
    state.phase = 'round.over';
  }
}

function advance(state: SwoopState, rs: SwoopRuleSet, now: number) {
  state.currentSeat = nextActiveSeat(state, state.currentSeat);
  state.turnDeadline = deadline(rs, now);
}

/** Put cards on the pile and resolve clears, sevens, finishing, and whose turn is next. */
function resolvePlay(state: SwoopState, rs: SwoopRuleSet, p: SwoopPlayer, cards: Card[], now: number) {
  state.pile.push(...cards);
  const kind = cardKind(cards[0], rs);
  const cleared = kind === 'clear' || (rs.fourOfAKindClears && topIsFourOfAKind(state.pile));
  state.sevenActive = !cleared && rs.sevenLower && cards[0].rank === '7';
  if (cleared) {
    state.cleared.push(...state.pile);
    state.pile = [];
    state.sevenActive = false;
    log(state, `${p.name} swooped the pile with ${cards.length > 1 ? `${cards.length} ` : ''}${cards[0].rank === 'JOKER' ? 'Joker' : cards[0].rank}${cards.length > 1 ? 's' : ''}.`);
  } else {
    log(state, `${p.name} played ${cards.length > 1 ? `${cards.length} ` : ''}${cards[0].rank === 'JOKER' ? 'Joker' : cards[0].rank}${cards.length > 1 ? 's' : ''}.`);
  }
  refill(state, rs, p);
  if (p.hand.length === 0 && p.faceUp.length === 0 && p.faceDown.length === 0) {
    p.finished = state.finishedCount++;
    log(state, `${p.name} is out${p.finished === 0 ? ' first' : ''}!`);
    const remaining = state.players.filter((x) => x.finished === undefined);
    if (remaining.length <= 1) {
      endRound(state, rs);
      return;
    }
    advance(state, rs, now);
    return;
  }
  if (cleared && rs.afterClear === 'playAgain') {
    state.turnDeadline = deadline(rs, now);
    return;
  }
  advance(state, rs, now);
}

function pickUp(state: SwoopState, rs: SwoopRuleSet, p: SwoopPlayer, extra: Card[], now: number) {
  p.hand.push(...state.pile, ...extra);
  state.pile = [];
  state.sevenActive = false;
  log(state, `${p.name} picked up the pile.`);
  advance(state, rs, now);
}

function requireCurrent(state: SwoopState, userId: string): { player: SwoopPlayer } | SwoopResult {
  const player = byUser(state, userId);
  if (!player) return err('NOT_A_PLAYER', 'You are not in this game');
  if (state.phase !== 'turn') return err('WRONG_PHASE', `Cannot play during ${state.phase}`);
  if (state.currentSeat !== player.seat) return err('NOT_YOUR_TURN', 'It is not your turn');
  if (player.finished !== undefined) return err('ALREADY_FINISHED', 'You are already out');
  return { player };
}

/** Timeout / fallback play for a seat: lowest legal rank, else pick up (or blind flip). */
export function autoPlay(state: SwoopState, rs: SwoopRuleSet, seat: number, now: number): SwoopAction {
  const p = state.players[seat];
  const src = playSource(p);
  if (src === 'faceDown') return { type: 'PLAY_BLIND', userId: p.userId, index: 0, now };
  const pool = src === 'hand' ? p.hand : p.faceUp;
  const ranks = legalRanks(pool, state, rs);
  const normal = ranks.filter((r) => cardKind(pool.find((c) => c.rank === r)!, rs) === 'normal').sort((a, b) => cardValue(pool.find((c) => c.rank === a)!, rs) - cardValue(pool.find((c) => c.rank === b)!, rs));
  const pick = normal[0] ?? ranks.find((r) => cardKind(pool.find((c) => c.rank === r)!, rs) === 'reset') ?? ranks[0];
  if (pick === undefined) return { type: 'PICK_UP', userId: p.userId, now };
  return { type: 'PLAY', userId: p.userId, cardIds: pool.filter((c) => c.rank === pick).map((c) => c.id), now };
}

export function reduceSwoop(rs: SwoopRuleSet, prev: SwoopState, action: SwoopAction): SwoopResult {
  const state = structuredClone(prev);
  const done = (s: SwoopState, r: SwoopRuleSet = rs): SwoopResult => {
    s.version = prev.version + 1;
    return { ok: true, state: s, ruleSet: r };
  };

  switch (action.type) {
    case 'JOIN': {
      if (state.phase !== 'lobby') {
        const p = byUser(state, action.userId);
        if (!p) return err('WRONG_PHASE', 'Game already started');
        p.connected = true;
        return done(state);
      }
      if (byUser(state, action.userId)) return err('ALREADY_JOINED', 'Already in this game');
      if (state.players.length >= rs.players.max) return err('GAME_FULL', 'Game is full');
      state.players.push(makePlayer(state.players.length, action.userId, action.name.trim().slice(0, 24) || `Player ${state.players.length + 1}`));
      log(state, `${action.name} joined.`);
      return done(state);
    }
    case 'ADD_BOT': {
      if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Bots can only be added in the lobby');
      if (action.userId !== state.hostUserId) return err('NOT_HOST', 'Only the host can add bots');
      if (state.players.length >= rs.players.max) return err('GAME_FULL', 'Game is full');
      if (byUser(state, action.botId)) return err('ALREADY_JOINED', 'Bot already added');
      state.players.push(makePlayer(state.players.length, action.botId, action.name.trim().slice(0, 24) || `Bot ${state.players.length + 1}`, true));
      log(state, `${action.name} (bot) joined.`);
      return done(state);
    }
    case 'REMOVE_BOT': {
      if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Bots can only be removed in the lobby');
      if (action.userId !== state.hostUserId) return err('NOT_HOST', 'Only the host can remove bots');
      const bot = byUser(state, action.botId);
      if (!bot?.isBot) return err('NOT_A_PLAYER', 'No such bot');
      state.players = state.players.filter((x) => x.userId !== action.botId).map((x, i) => ({ ...x, seat: i }));
      return done(state);
    }
    case 'LEAVE': {
      if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Cannot leave a game in progress');
      const p = byUser(state, action.userId);
      if (!p || p.isBot) return err('NOT_A_PLAYER', 'Not in this game');
      state.players = state.players.filter((x) => x.userId !== action.userId).map((x, i) => ({ ...x, seat: i }));
      log(state, `${p.name} left.`);
      return done(state);
    }
    case 'SET_RULESET': {
      if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Rules can only change in the lobby');
      if (action.userId !== state.hostUserId) return err('NOT_HOST', 'Only the host can change rules');
      const problems = validateSwoopRuleSet(action.ruleSet);
      if (problems.length) return err('INVALID_RULESET', problems.join('; '));
      for (const p of state.players) if (!p.isBot) p.ready = false;
      log(state, `Rules set to "${action.ruleSet.name}".`);
      return done(state, action.ruleSet);
    }
    case 'READY': {
      if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Not in lobby');
      const p = byUser(state, action.userId);
      if (!p) return err('NOT_A_PLAYER', 'Not in this game');
      p.ready = action.ready;
      return done(state);
    }
    case 'START': {
      if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Game already started');
      if (action.userId !== state.hostUserId) return err('NOT_HOST', 'Only the host can start');
      if (state.players.length < rs.players.min) return err('TOO_FEW_PLAYERS', `Need at least ${rs.players.min} players`);
      if (state.players.length > rs.players.max) return err('GAME_FULL', 'Too many players for these rules');
      if (!state.players.every((p) => p.ready || p.userId === state.hostUserId)) return err('NOT_READY', 'Everyone must be ready');
      const problems = validateSwoopRuleSet(rs);
      if (problems.length) return err('INVALID_RULESET', problems.join('; '));
      if (state.players.length * cardsPerPlayer(rs) > rs.decks * (52 + rs.jokersPerDeck)) return err('INVALID_RULESET', 'Not enough cards for this many players; add a deck');
      state.roundIndex = 0;
      state.dealerSeat = 0;
      for (const p of state.players) p.scores = [];
      deal(state, rs, action.now);
      return done(state);
    }
    case 'SWAP': {
      if (state.phase !== 'swap') return err('WRONG_PHASE', 'Swapping is over');
      const p = byUser(state, action.userId);
      if (!p) return err('NOT_A_PLAYER', 'Not in this game');
      if (p.doneSwapping) return err('WRONG_PHASE', 'You already finished swapping');
      const hi = p.hand.findIndex((c) => c.id === action.handCardId);
      const ui = p.faceUp.findIndex((c) => c.id === action.faceUpCardId);
      if (hi < 0 || ui < 0) return err('CARD_NOT_AVAILABLE', 'Pick one card from your hand and one face-up card');
      [p.hand[hi], p.faceUp[ui]] = [p.faceUp[ui], p.hand[hi]];
      return done(state);
    }
    case 'DONE_SWAPPING': {
      if (state.phase !== 'swap') return err('WRONG_PHASE', 'Swapping is over');
      const p = byUser(state, action.userId);
      if (!p) return err('NOT_A_PLAYER', 'Not in this game');
      p.doneSwapping = true;
      if (state.players.every((x) => x.doneSwapping)) startTurns(state, rs, action.now);
      return done(state);
    }
    case 'PLAY': {
      const r = requireCurrent(state, action.userId);
      if ('ok' in r) return r;
      const { player } = r;
      const src = playSource(player);
      if (src === 'faceDown') return err('WRONG_SOURCE', 'Play a face-down card blind');
      if (src === 'none') return err('ALREADY_FINISHED', 'No cards left');
      const pool = src === 'hand' ? player.hand : player.faceUp;
      if (action.cardIds.length === 0) return err('CARD_NOT_AVAILABLE', 'Select at least one card');
      const cards = action.cardIds.map((id) => pool.find((c) => c.id === id));
      if (cards.some((c) => !c)) return err('CARD_NOT_AVAILABLE', src === 'hand' ? 'Those cards are not in your hand' : 'Play from your face-up cards now');
      const chosen = cards as Card[];
      if (new Set(chosen.map((c) => c.rank)).size !== 1) return err('MIXED_RANKS', 'Play one rank at a time');
      if (!isLegalPlay(chosen, state, rs)) return err('ILLEGAL_PLAY', 'That cannot go on the pile');
      const ids = new Set(chosen.map((c) => c.id));
      if (src === 'hand') player.hand = player.hand.filter((c) => !ids.has(c.id));
      else player.faceUp = player.faceUp.filter((c) => !ids.has(c.id));
      resolvePlay(state, rs, player, chosen, action.now);
      return done(state);
    }
    case 'PLAY_BLIND': {
      const r = requireCurrent(state, action.userId);
      if ('ok' in r) return r;
      const { player } = r;
      if (playSource(player) !== 'faceDown') return err('WRONG_SOURCE', 'You still have cards to play first');
      const idx = action.index;
      if (!Number.isInteger(idx) || idx < 0 || idx >= player.faceDown.length) return err('CARD_NOT_AVAILABLE', 'That is not one of your face-down cards');
      const [card] = player.faceDown.splice(idx, 1);
      if (isLegalPlay([card], state, rs)) {
        log(state, `${player.name} flipped a ${card.rank === 'JOKER' ? 'Joker' : card.rank}.`);
        resolvePlay(state, rs, player, [card], action.now);
      } else {
        log(state, `${player.name} flipped a ${card.rank === 'JOKER' ? 'Joker' : card.rank}: no good.`);
        pickUp(state, rs, player, [card], action.now);
      }
      return done(state);
    }
    case 'PICK_UP': {
      const r = requireCurrent(state, action.userId);
      if ('ok' in r) return r;
      const { player } = r;
      if (state.pile.length === 0) return err('NOTHING_TO_DO', 'The pile is empty; play anything');
      const src = playSource(player);
      if (src === 'faceDown') return err('WRONG_SOURCE', 'Flip a face-down card instead');
      const pool = src === 'hand' ? player.hand : player.faceUp;
      if (!rs.voluntaryPickup && legalRanks(pool, state, rs).length > 0) return err('MUST_PLAY', 'You have a legal play');
      pickUp(state, rs, player, [], action.now);
      return done(state);
    }
    case 'REORDER_HAND': {
      const p = byUser(state, action.userId);
      if (!p) return err('NOT_A_PLAYER', 'Not in this game');
      const ids = new Set(action.cardIds);
      if (ids.size !== p.hand.length || !p.hand.every((c) => ids.has(c.id))) return err('CARD_NOT_AVAILABLE', 'Reorder must include exactly your hand');
      const byId = new Map(p.hand.map((c) => [c.id, c]));
      p.hand = action.cardIds.map((id) => byId.get(id)!);
      return done(state);
    }
    case 'NEXT_ROUND': {
      if (state.phase !== 'round.over') return err('WRONG_PHASE', 'Round is not over');
      if (action.userId !== state.hostUserId) return err('NOT_HOST', 'Only the host can deal the next round');
      state.roundIndex += 1;
      state.dealerSeat = (state.dealerSeat + 1) % state.players.length;
      deal(state, rs, action.now);
      return done(state);
    }
    case 'TICK': {
      if (state.turnDeadline === undefined || action.now < state.turnDeadline) return err('NOTHING_TO_DO', 'No deadline reached');
      if (state.phase === 'swap') {
        for (const p of state.players) p.doneSwapping = true;
        startTurns(state, rs, action.now);
        log(state, 'Swap time is up.');
        return done(state);
      }
      if (state.phase === 'turn') {
        const p = state.players[state.currentSeat];
        log(state, `${p.name} timed out.`);
        const auto = autoPlay(state, rs, state.currentSeat, action.now);
        const r = reduceSwoop(rs, { ...state, version: prev.version }, auto);
        return r.ok ? done(r.state) : err('NOTHING_TO_DO', r.error.message);
      }
      return err('NOTHING_TO_DO', 'No timer in this phase');
    }
    case 'RECONNECT':
    case 'DISCONNECT': {
      const p = byUser(state, action.userId);
      if (!p) return err('NOT_A_PLAYER', 'Not in this game');
      p.connected = action.type === 'RECONNECT';
      return done(state);
    }
  }
}
