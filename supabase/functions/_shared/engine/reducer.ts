import { buildDeck, handScore, isWild, shuffle, type Card } from './cards.ts';
import { matchContract } from './contracts.ts';
import { layOffCards, replaceWildInRun, type Meld } from './melds.ts';
import { validateRuleSet, type RuleSet } from './ruleset.ts';
import type { Action, EngineError, ErrorCode, GameState, PlayerState, ReduceResult } from './state.ts';

// ---------- helpers ----------

const err = (code: ErrorCode, message: string): ReduceResult => ({ ok: false, error: { code, message } });

export function createGame(hostUserId: string, rngSeed: string): GameState {
  return {
    version: 0,
    phase: 'lobby',
    hostUserId,
    roundIndex: 0,
    dealerSeat: 0,
    currentSeat: 0,
    players: [],
    stock: [],
    discard: [],
    melds: [],
    rngSeed,
    nextMeldId: 1,
    log: [],
  };
}

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function log(state: GameState, msg: string) {
  state.log = [...state.log.slice(-29), msg];
}

function playerByUser(state: GameState, userId: string): PlayerState | undefined {
  return state.players.find((p) => p.userId === userId);
}

function nextSeat(state: GameState, seat: number): number {
  return (seat + 1) % state.players.length;
}

function currentContract(state: GameState, rs: RuleSet) {
  return rs.rounds[state.roundIndex];
}

function isLastRound(state: GameState, rs: RuleSet) {
  return state.roundIndex >= rs.rounds.length - 1;
}

function turnDeadline(rs: RuleSet, now: number): number | undefined {
  return rs.turnTimerSeconds > 0 ? now + rs.turnTimerSeconds * 1000 : undefined;
}

function takeFromHand(player: PlayerState, cardIds: string[]): Card[] | null {
  const taken: Card[] = [];
  const remaining = player.hand.slice();
  for (const id of cardIds) {
    const i = remaining.findIndex((c) => c.id === id);
    if (i < 0) return null;
    taken.push(remaining[i]);
    remaining.splice(i, 1);
  }
  player.hand = remaining;
  return taken;
}

/** Draw n cards from stock, reshuffling the discard pile (minus its top card) if needed. */
function drawFromStock(state: GameState, n: number): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    if (state.stock.length === 0) {
      if (state.discard.length <= 1) break;
      const top = state.discard.pop()!;
      state.stock = shuffle(state.discard, `${state.rngSeed}:reshuffle:${state.version}:${i}`);
      state.discard = [top];
      log(state, 'Stock ran out; discard pile reshuffled.');
    }
    out.push(state.stock.pop()!);
  }
  return out;
}

function deal(state: GameState, rs: RuleSet, now: number) {
  const deck = shuffle(buildDeck(rs), `${state.rngSeed}:round:${state.roundIndex}`);
  state.stock = deck;
  state.discard = [];
  state.melds = [];
  state.buyWindow = undefined;
  state.wentOutSeat = undefined;
  for (const p of state.players) {
    p.hand = [];
    p.buysLeft = rs.buysPerRound;
    p.hasLaidDown = false;
  }
  const first = nextSeat(state, state.dealerSeat);
  for (let i = 0; i < rs.cardsPerRound; i++) {
    for (let k = 0; k < state.players.length; k++) {
      const seat = (first + k) % state.players.length;
      state.players[seat].hand.push(state.stock.pop()!);
    }
  }
  state.discard.push(state.stock.pop()!);
  state.currentSeat = first;
  state.phase = 'turn.draw';
  state.turnDeadline = turnDeadline(rs, now);
  const contract = currentContract(state, rs);
  log(state, `Round ${state.roundIndex + 1}: ${contract.name}${contract.noDiscard ? ' (no discard)' : ''}. ${state.players[state.dealerSeat].name} deals.`);
}

function endRound(state: GameState, rs: RuleSet, wentOutSeat?: number) {
  state.wentOutSeat = wentOutSeat;
  for (const p of state.players) {
    const score = p.seat === wentOutSeat ? 0 : handScore(p.hand, rs);
    p.scores[state.roundIndex] = score;
  }
  state.buyWindow = undefined;
  state.turnDeadline = undefined;
  if (wentOutSeat !== undefined) log(state, `${state.players[wentOutSeat].name} went out!`);
  else log(state, 'Round ended with no cards left to draw.');
  if (isLastRound(state, rs)) {
    state.phase = 'game.over';
    const totals = state.players.map((p) => p.scores.reduce((a, b) => a + b, 0));
    const best = Math.min(...totals);
    state.winnerSeats = state.players.filter((_, i) => totals[i] === best).map((p) => p.seat);
    log(state, `Game over. Winner: ${state.winnerSeats.map((s) => state.players[s].name).join(', ')}`);
  } else {
    state.phase = 'round.over';
  }
}

function advanceTurn(state: GameState, rs: RuleSet, now: number) {
  state.currentSeat = nextSeat(state, state.currentSeat);
  state.phase = 'turn.draw';
  state.turnDeadline = turnDeadline(rs, now);
}

/** After a discard: build the buy window (if anyone is eligible) and advance the turn. */
function openBuyWindow(state: GameState, rs: RuleSet, now: number, discarderSeat: number) {
  const current = nextSeat(state, discarderSeat);
  state.currentSeat = current;
  state.turnDeadline = turnDeadline(rs, now);
  const order: number[] = [];
  const n = state.players.length;
  for (let k = 1; k < n; k++) {
    const seat = (current + k) % n;
    if (seat === discarderSeat) continue;
    const p = state.players[seat];
    if (p.buysLeft > 0 && !p.hasLaidDown) order.push(seat);
  }
  if (order.length === 0 || state.discard.length === 0) {
    state.buyWindow = undefined;
    state.phase = 'turn.draw';
    return;
  }
  state.buyWindow = {
    discardCardId: state.discard[state.discard.length - 1].id,
    order,
    index: 0,
    claims: [],
    deadline: now + rs.buyWindowSeconds * 1000,
  };
  state.phase = 'buy.window';
}

function giveBuy(state: GameState, rs: RuleSet, seat: number) {
  const p = state.players[seat];
  const top = state.discard.pop()!;
  const penalty = drawFromStock(state, rs.buyPenaltyCards);
  p.hand.push(top, ...penalty);
  p.buysLeft -= 1;
  log(state, `${p.name} bought the ${top.rank === 'JOKER' ? 'Joker' : top.rank}. ${p.buysLeft} buys left.`);
}

/** Resolve the buy window: the first claimant in priority wins. */
function resolveBuyWindow(state: GameState, rs: RuleSet) {
  const bw = state.buyWindow;
  if (!bw) return;
  const winner = bw.order.find((s) => bw.claims.includes(s));
  if (winner !== undefined) giveBuy(state, rs, winner);
  state.buyWindow = undefined;
  state.phase = 'turn.draw';
}

/** Priority holder passes (explicitly or by timeout). */
function passPriority(state: GameState, rs: RuleSet, now: number) {
  const bw = state.buyWindow;
  if (!bw) return;
  bw.index += 1;
  bw.deadline = now + rs.buyWindowSeconds * 1000;
  // If the new priority holder already claimed, they win immediately.
  while (bw.index < bw.order.length) {
    if (bw.claims.includes(bw.order[bw.index])) {
      resolveBuyWindow(state, rs);
      return;
    }
    // Skip seats which are no longer eligible (shouldn't happen mid-window, but be safe).
    const p = state.players[bw.order[bw.index]];
    if (p.buysLeft <= 0 || p.hasLaidDown) {
      bw.index += 1;
      continue;
    }
    return;
  }
  state.buyWindow = undefined;
  state.phase = 'turn.draw';
}

function checkWentOut(state: GameState, rs: RuleSet, seat: number): boolean {
  if (state.players[seat].hand.length === 0) {
    endRound(state, rs, seat);
    return true;
  }
  return false;
}

function requireCurrent(state: GameState, userId: string, phases: GameState['phase'][]): { player: PlayerState } | ReduceResult {
  const player = playerByUser(state, userId);
  if (!player) return err('NOT_A_PLAYER', 'You are not in this game');
  if (!phases.includes(state.phase)) return err('WRONG_PHASE', `Cannot do that during ${state.phase}`);
  if (state.currentSeat !== player.seat) return err('NOT_YOUR_TURN', 'It is not your turn');
  return { player };
}

// ---------- reducer ----------

export function reduce(ruleSet: RuleSet, prev: GameState, action: Action): ReduceResult {
  const state = clone(prev);
  const rs = ruleSet;
  const done = (s: GameState, r: RuleSet = rs): ReduceResult => {
    s.version = prev.version + 1;
    return { ok: true, state: s, ruleSet: r };
  };

  switch (action.type) {
    // ----- lobby -----
    case 'JOIN': {
      if (state.phase !== 'lobby') {
        // Rejoin during play just flags connection.
        const p = playerByUser(state, action.userId);
        if (!p) return err('WRONG_PHASE', 'Game already started');
        p.connected = true;
        return done(state);
      }
      if (playerByUser(state, action.userId)) return err('ALREADY_JOINED', 'Already in this game');
      if (state.players.length >= rs.players.max) return err('GAME_FULL', 'Game is full');
      state.players.push({
        seat: state.players.length,
        userId: action.userId,
        name: action.name.trim().slice(0, 24) || `Player ${state.players.length + 1}`,
        hand: [],
        buysLeft: rs.buysPerRound,
        hasLaidDown: false,
        scores: [],
        ready: false,
        connected: true,
      });
      log(state, `${action.name} joined.`);
      return done(state);
    }
    case 'ADD_BOT': {
      if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Bots can only be added in the lobby');
      if (action.userId !== state.hostUserId) return err('NOT_HOST', 'Only the host can add bots');
      if (state.players.length >= rs.players.max) return err('GAME_FULL', 'Game is full');
      if (playerByUser(state, action.botId)) return err('ALREADY_JOINED', 'Bot already added');
      state.players.push({
        seat: state.players.length,
        userId: action.botId,
        name: action.name.trim().slice(0, 24) || `Bot ${state.players.length + 1}`,
        hand: [],
        buysLeft: rs.buysPerRound,
        hasLaidDown: false,
        scores: [],
        ready: true,
        connected: true,
        isBot: true,
      });
      log(state, `${action.name} (bot) joined.`);
      return done(state);
    }
    case 'REMOVE_BOT': {
      if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Bots can only be removed in the lobby');
      if (action.userId !== state.hostUserId) return err('NOT_HOST', 'Only the host can remove bots');
      const bot = playerByUser(state, action.botId);
      if (!bot || !bot.isBot) return err('NOT_A_PLAYER', 'No such bot');
      state.players = state.players.filter((x) => x.userId !== action.botId).map((x, i) => ({ ...x, seat: i }));
      log(state, `${bot.name} (bot) removed.`);
      return done(state);
    }
    case 'LEAVE': {
      if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Cannot leave a game in progress');
      const p = playerByUser(state, action.userId);
      if (!p) return err('NOT_A_PLAYER', 'Not in this game');
      if (p.isBot) return err('NOT_A_PLAYER', 'Bots are removed by the host');
      state.players = state.players.filter((x) => x.userId !== action.userId).map((x, i) => ({ ...x, seat: i }));
      log(state, `${p.name} left.`);
      return done(state);
    }
    case 'SET_RULESET': {
      if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Rules can only change in the lobby');
      if (action.userId !== state.hostUserId) return err('NOT_HOST', 'Only the host can change rules');
      const problems = validateRuleSet(action.ruleSet);
      if (problems.length) return err('INVALID_RULESET', problems.join('; '));
      for (const p of state.players) p.ready = false;
      log(state, `Rules set to "${action.ruleSet.name}".`);
      return done(state, action.ruleSet);
    }
    case 'READY': {
      if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Not in lobby');
      const p = playerByUser(state, action.userId);
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
      const problems = validateRuleSet(rs);
      if (problems.length) return err('INVALID_RULESET', problems.join('; '));
      state.roundIndex = 0;
      state.dealerSeat = 0;
      for (const p of state.players) p.scores = [];
      deal(state, rs, action.now);
      return done(state);
    }

    // ----- drawing -----
    case 'DRAW_STOCK': {
      const r = requireCurrent(state, action.userId, ['turn.draw', 'buy.window']);
      if ('ok' in r) return r;
      if (state.phase === 'buy.window') resolveBuyWindow(state, rs);
      const [card] = drawFromStock(state, 1);
      if (!card) {
        endRound(state, rs);
        return done(state);
      }
      r.player.hand.push(card);
      state.phase = 'turn.play';
      return done(state);
    }
    case 'DRAW_DISCARD': {
      const r = requireCurrent(state, action.userId, ['turn.draw', 'buy.window']);
      if ('ok' in r) return r;
      if (state.discard.length === 0) return err('NOTHING_TO_DO', 'Discard pile is empty');
      // Taking the discard on your own turn cancels the buy window.
      state.buyWindow = undefined;
      const top = state.discard.pop()!;
      r.player.hand.push(top);
      state.phase = 'turn.play';
      log(state, `${r.player.name} took the discard.`);
      return done(state);
    }

    // ----- buying -----
    case 'BUY': {
      const p = playerByUser(state, action.userId);
      if (!p) return err('NOT_A_PLAYER', 'Not in this game');
      if (state.phase !== 'buy.window' || !state.buyWindow) return err('WRONG_PHASE', 'Nothing to buy right now');
      if (p.buysLeft <= 0) return err('NO_BUYS_LEFT', 'No buys left');
      if (p.hasLaidDown) return err('NOT_ELIGIBLE_TO_BUY', 'You cannot buy after laying down');
      const bw = state.buyWindow;
      if (!bw.order.includes(p.seat)) return err('NOT_ELIGIBLE_TO_BUY', 'You are not eligible to buy this card');
      if (bw.order.indexOf(p.seat) < bw.index) return err('NOT_ELIGIBLE_TO_BUY', 'Your priority has passed');
      if (!bw.claims.includes(p.seat)) bw.claims.push(p.seat);
      if (bw.order[bw.index] === p.seat) resolveBuyWindow(state, rs);
      return done(state);
    }
    case 'PASS_BUY': {
      const p = playerByUser(state, action.userId);
      if (!p) return err('NOT_A_PLAYER', 'Not in this game');
      if (state.phase !== 'buy.window' || !state.buyWindow) return err('WRONG_PHASE', 'No buy window open');
      const bw = state.buyWindow;
      if (bw.order[bw.index] !== p.seat) {
        // Passing out of priority just removes any claim.
        bw.claims = bw.claims.filter((s) => s !== p.seat);
        return done(state);
      }
      bw.claims = bw.claims.filter((s) => s !== p.seat);
      passPriority(state, rs, action.now);
      return done(state);
    }

    // ----- playing -----
    case 'LAY_DOWN': {
      const r = requireCurrent(state, action.userId, ['turn.play']);
      if ('ok' in r) return r;
      const { player } = r;
      if (player.hasLaidDown) return err('ALREADY_LAID_DOWN', 'You have already laid down this round');
      const contract = currentContract(state, rs);
      const groups: Card[][] = [];
      const snapshot = player.hand.slice();
      for (const ids of action.melds) {
        const cards = takeFromHand(player, ids);
        if (!cards) {
          player.hand = snapshot;
          return err('CARD_NOT_IN_HAND', 'One of those cards is not in your hand');
        }
        groups.push(cards);
      }
      const match = matchContract(groups, contract, rs);
      if (!match.ok) {
        player.hand = snapshot;
        return err('CONTRACT_NOT_MET', match.error);
      }
      if (player.hand.length === 0 && !contract.noDiscard) {
        player.hand = snapshot;
        return err('MUST_KEEP_DISCARD', 'You must keep a card to discard');
      }
      for (const built of match.melds) {
        state.melds.push({ ...built, id: `m${state.nextMeldId++}`, ownerSeat: player.seat } as Meld);
      }
      player.hasLaidDown = true;
      log(state, `${player.name} laid down ${contract.name}.`);
      if (checkWentOut(state, rs, player.seat)) return done(state);
      return done(state);
    }
    case 'LAY_OFF': {
      const r = requireCurrent(state, action.userId, ['turn.play']);
      if ('ok' in r) return r;
      const { player } = r;
      if (rs.layOff === 'never') return err('LAY_OFF_NOT_ALLOWED', 'Laying off is disabled');
      if (!player.hasLaidDown) return err('NOT_LAID_DOWN', 'Lay down your contract first');
      const meldIdx = state.melds.findIndex((m) => m.id === action.meldId);
      if (meldIdx < 0) return err('MELD_NOT_FOUND', 'Meld not found');
      const snapshot = player.hand.slice();
      const cards = takeFromHand(player, action.cardIds);
      if (!cards) return err('CARD_NOT_IN_HAND', 'One of those cards is not in your hand');
      const result = layOffCards(state.melds[meldIdx], cards, rs);
      if (!result.ok) {
        player.hand = snapshot;
        return err('INVALID_MELD', result.error);
      }
      const contract = currentContract(state, rs);
      if (player.hand.length === 0 && !contract.noDiscard) {
        player.hand = snapshot;
        return err('MUST_KEEP_DISCARD', 'You must keep a card to discard');
      }
      state.melds[meldIdx] = result.value;
      if (checkWentOut(state, rs, player.seat)) return done(state);
      return done(state);
    }
    case 'REPLACE_WILD': {
      const r = requireCurrent(state, action.userId, ['turn.play']);
      if ('ok' in r) return r;
      const { player } = r;
      if (!rs.wildReplacement.enabled) return err('WILD_REPLACEMENT_DISABLED', 'Wild replacement is disabled');
      if (!player.hasLaidDown) return err('NOT_LAID_DOWN', 'Lay down your contract first');
      const meldIdx = state.melds.findIndex((m) => m.id === action.meldId);
      if (meldIdx < 0) return err('MELD_NOT_FOUND', 'Meld not found');
      const meld = state.melds[meldIdx];
      if (rs.wildReplacement.who === 'ownerOnly' && meld.ownerSeat !== player.seat)
        return err('WILD_REPLACEMENT_NOT_ALLOWED', 'Only the owner can replace wilds in that run');
      const snapshot = player.hand.slice();
      const taken = takeFromHand(player, [action.naturalCardId]);
      if (!taken) return err('CARD_NOT_IN_HAND', 'That card is not in your hand');
      const rep = replaceWildInRun(meld, action.wildCardId, taken[0], rs);
      if (!rep.ok) {
        player.hand = snapshot;
        return err('INVALID_MELD', rep.error);
      }
      const melds = state.melds.slice();
      melds[meldIdx] = rep.value.meld;
      // The freed wild must be played immediately.
      const targetIdx = melds.findIndex((m) => m.id === action.playTo.meldId);
      if (targetIdx < 0) {
        player.hand = snapshot;
        return err('MELD_NOT_FOUND', 'Target meld for the wild not found');
      }
      const placed = layOffCards(melds[targetIdx], [rep.value.wild], rs);
      if (!placed.ok) {
        if (rs.wildReplacement.mustPlayImmediately) {
          player.hand = snapshot;
          return err('WILD_MUST_BE_PLAYED', `The wild cannot be played there: ${placed.error}`);
        }
        player.hand.push(rep.value.wild);
      } else {
        melds[targetIdx] = placed.value;
      }
      state.melds = melds;
      log(state, `${player.name} replaced a wild.`);
      if (checkWentOut(state, rs, player.seat)) return done(state);
      return done(state);
    }
    case 'DISCARD': {
      const r = requireCurrent(state, action.userId, ['turn.play']);
      if ('ok' in r) return r;
      const { player } = r;
      const contract = currentContract(state, rs);
      if (contract.noDiscard) return err('NO_DISCARD_ROUND', 'No discarding in this round; you must go out on your last card');
      const cards = takeFromHand(player, [action.cardId]);
      if (!cards) return err('CARD_NOT_IN_HAND', 'That card is not in your hand');
      state.discard.push(cards[0]);
      if (checkWentOut(state, rs, player.seat)) return done(state);
      openBuyWindow(state, rs, action.now, player.seat);
      return done(state);
    }
    case 'END_TURN': {
      const r = requireCurrent(state, action.userId, ['turn.play']);
      if ('ok' in r) return r;
      const contract = currentContract(state, rs);
      if (!contract.noDiscard) return err('MUST_DISCARD', 'You must discard to end your turn');
      advanceTurn(state, rs, action.now);
      return done(state);
    }
    case 'REORDER_HAND': {
      const p = playerByUser(state, action.userId);
      if (!p) return err('NOT_A_PLAYER', 'Not in this game');
      const ids = new Set(action.cardIds);
      if (ids.size !== p.hand.length || !p.hand.every((c) => ids.has(c.id)))
        return err('CARD_NOT_IN_HAND', 'Reorder must include exactly your hand');
      const byId = new Map(p.hand.map((c) => [c.id, c]));
      p.hand = action.cardIds.map((id) => byId.get(id)!);
      return done(state);
    }
    case 'NEXT_ROUND': {
      if (state.phase !== 'round.over') return err('WRONG_PHASE', 'Round is not over');
      if (action.userId !== state.hostUserId) return err('NOT_HOST', 'Only the host can start the next round');
      state.roundIndex += 1;
      state.dealerSeat = nextSeat(state, state.dealerSeat);
      deal(state, rs, action.now);
      return done(state);
    }

    // ----- server -----
    case 'TICK': {
      const now = action.now;
      if (state.phase === 'buy.window' && state.buyWindow) {
        if (state.turnDeadline !== undefined && now >= state.turnDeadline) {
          // Current player timed out: auto-draw from stock, which resolves the window.
          resolveBuyWindow(state, rs);
          return autoDraw(state, rs, now, done);
        }
        if (now >= state.buyWindow.deadline) {
          passPriority(state, rs, now);
          return done(state);
        }
        return err('NOTHING_TO_DO', 'No deadline reached');
      }
      if (state.turnDeadline === undefined || now < state.turnDeadline) return err('NOTHING_TO_DO', 'No deadline reached');
      if (state.phase === 'turn.draw') return autoDraw(state, rs, now, done);
      if (state.phase === 'turn.play') {
        const player = state.players[state.currentSeat];
        const contract = currentContract(state, rs);
        if (contract.noDiscard) {
          log(state, `${player.name} timed out.`);
          advanceTurn(state, rs, now);
          return done(state);
        }
        // Discard the highest-scoring card.
        let worst = player.hand[0];
        for (const c of player.hand) if (handScore([c], rs) > handScore([worst], rs)) worst = c;
        takeFromHand(player, [worst.id]);
        state.discard.push(worst);
        log(state, `${player.name} timed out and discarded.`);
        if (checkWentOut(state, rs, player.seat)) return done(state);
        openBuyWindow(state, rs, now, player.seat);
        return done(state);
      }
      return err('NOTHING_TO_DO', 'No timer in this phase');
    }
    case 'RECONNECT':
    case 'DISCONNECT': {
      const p = playerByUser(state, action.userId);
      if (!p) return err('NOT_A_PLAYER', 'Not in this game');
      p.connected = action.type === 'RECONNECT';
      return done(state);
    }
  }
}

function autoDraw(state: GameState, rs: RuleSet, now: number, done: (s: GameState) => ReduceResult): ReduceResult {
  const player = state.players[state.currentSeat];
  const [card] = drawFromStock(state, 1);
  if (!card) {
    endRound(state, rs);
    return done(state);
  }
  player.hand.push(card);
  state.phase = 'turn.play';
  state.turnDeadline = turnDeadline(rs, now);
  log(state, `${player.name} timed out and drew from stock.`);
  return done(state);
}

/** Convenience for UIs: which seats may buy right now. */
export function eligibleBuyers(state: Pick<GameState, 'phase' | 'buyWindow'>): number[] {
  const bw = state.buyWindow;
  if (!bw || state.phase !== 'buy.window') return [];
  return bw.order.slice(bw.index);
}

export function isWildCard(card: Card, rs: RuleSet): boolean {
  return isWild(card, rs);
}

export { validateRuleSet };
export type { EngineError };
