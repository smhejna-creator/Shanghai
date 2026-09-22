# Shang Hi — Online Shanghai Rummy (Contract Rummy)

This document is the build plan. It defines the configurable `RuleSet`, the
data model, the full action list, and the phase state machine. Code follows
only after this is confirmed.

## 0. Stack and package layout

| Layer | Choice |
|---|---|
| Frontend | Vite + React 18 + TypeScript + Tailwind |
| Backend | Supabase: Auth (magic link), Postgres, Realtime, Edge Functions (Deno) |
| Tests | Vitest (engine), run against three rule sets |
| Deploy | Netlify (SPA redirect, env vars for Supabase URL / anon key) |

```
/src/engine          pure game logic — zero React / Supabase imports
  ruleset.ts         RuleSet type, presets, validation
  cards.ts           card model, deck builder, wild detection, scoring
  melds.ts           set / run validation, wild placement, replacement
  contracts.ts       contract satisfaction checks
  reducer.ts         (ruleSet, state, action) -> { state } | { error }
  view.ts            redact full state into a per-player view
  index.ts
/src/engine/__tests__  Vitest suites
/src/ui              React app (lobby, setup, table, hand, scoreboard)
/src/lib/supabase    client, typed queries, realtime hooks, action RPC
/supabase/migrations SQL schema, RLS policies, triggers
/supabase/functions/game-action   Edge Function (imports /src/engine)
netlify.toml
```

The Edge Function imports the engine source directly (Deno resolves the
relative path), so server and client run the identical reducer.

## 1. RuleSet schema

```ts
type Rank = 'A'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K';

type MeldRequirement =
  | { kind: 'set'; size: number }     // same rank, size >= 3
  | { kind: 'run';  size: number };   // same suit, consecutive, size >= 4

interface Contract {
  id: string;                          // stable id for editing / reordering
  name: string;                        // "Two sets of 3"
  melds: MeldRequirement[];
  noDiscard: boolean;                  // must go out on last card, no final discard
}

interface RuleSet {
  version: 1;
  name: string;                        // "House default", "Classic 2s wild", or user-named

  players: { min: number; max: number };            // default { min: 2, max: 6 }
  decks: number;                                    // default 2; UI suggests 3 at 5+ players
  jokersPerDeck: number;                            // default 2 (2 decks -> 4 jokers)

  wilds: {
    jokers: true;                                   // always wild
    ranks: Rank[];                                  // default ['10']; presets: [], ['2'], ['10'], custom
  };

  rounds: Contract[];                               // ordered; default 7 below

  cardsPerRound: number;                            // default 11
  buysPerRound: number;                             // default 3
  buyPenaltyCards: number;                          // default 1 (stock cards taken with the discard)
  buyWindowSeconds: number;                         // default 8 — how long each buyer has before priority passes

  acesHighLow: 'high' | 'low' | 'either';           // default 'either'
                                                    // 'either' = A-2-3 and Q-K-A both legal; never wraps (K-A-2 illegal)

  layOff: 'afterOwnContract' | 'never';             // default 'afterOwnContract'
  wildReplacement: {
    enabled: boolean;                               // default true
    who: 'ownerOrLaidDown' | 'ownerOnly';           // default 'ownerOrLaidDown'
    mustPlayImmediately: boolean;                   // default true
  };

  scoring: {
    numberCards: 'faceValue';                       // 2..10 -> pip value
    faceCards: number;                              // default 10  (J, Q, K)
    ace: number;                                    // default 15
    joker: number;                                  // default 50
    wildRank: number;                               // default 20  (a natural-rank wild, e.g. 10 or 2, when in hand)
  };

  turnTimerSeconds: number;                         // default 90; 0 = off
  winner: 'lowestTotal';                            // fixed for now, kept in schema for future modes
}
```

Default rounds:

| # | Contract | noDiscard |
|---|---|---|
| 1 | two sets of 3 | no |
| 2 | one set of 3, one run of 4 | no |
| 3 | two runs of 4 | no |
| 4 | three sets of 3 | no |
| 5 | two sets of 3, one run of 4 | no |
| 6 | one set of 3, two runs of 4 | no |
| 7 | three runs of 4 | yes |

Presets:
- **House default**: everything above (jokers + 10s, aces either, 3 buys).
- **Classic 2s wild**: wilds jokers + 2s, aces low, 2 buys, same rounds.

`validateRuleSet(rs)` rejects: fewer than 1 round, meld sizes below 3/4,
players outside 2..6, 0 decks, a wild rank that makes a contract impossible
(e.g. more required natural cards than exist), timers below 10s unless 0.

Rule clarifications the engine enforces (all derived from the fields above):
- A meld needs more naturals than wilds (wilds < ceil(size/2)+… simplified to:
  wilds ≤ naturals). Two wilds may not be adjacent in a run.
- A wild-rank card (e.g. a 10 when 10s are wild) counts as wild anywhere; a
  natural 10 cannot be used as a natural in a run or set. The 20-point
  `wildRank` score applies to it in hand.
- Laying down means laying down the **exact contract** in one turn, nothing
  more, nothing less. Extra cards are laid off later.
- Laying off: only after you've laid down; onto any player's meld; must keep
  the meld valid. Not allowed on the round's "no discard" turn if it would
  leave you with zero cards without an actual go-out (going out by laying
  off is legal — that IS the go-out).
- Going out: your hand reaches 0 cards. Normal rounds: your last card is a
  discard. `noDiscard` rounds: your last card must be laid down / laid off;
  discarding is never allowed in that round, and drawing then holding 1
  unplayable card is simply the state you're stuck in.
- Wild replacement: a wild in a **run** can be swapped for the natural card
  it stands for by the meld owner, or by anyone who has laid down (per
  `who`). The wild goes to the replacer's hand and must be melded/laid off in
  the same turn (`mustPlayImmediately`), otherwise the action is rejected as a
  whole (the engine treats replace + play as a single atomic action).
- Buying: when a player discards, every other player who has buys remaining
  and has not laid down may buy. Only players who haven't laid down may buy.
  Priority is clockwise starting from the next player (the one whose turn it
  is now). The player whose turn it is may instead simply draw the discard
  for free; buying is only for out-of-turn players. Each eligible player gets
  `buyWindowSeconds` to claim before priority passes; the turn player may end
  the window early by drawing from stock, at which point the first buyer in
  priority who claimed wins. Buyer takes the discard + `buyPenaltyCards` from
  stock; buys counter decrements. If stock runs out, the discard pile (minus
  top card) is reshuffled into stock.
- Timer: on timeout in `draw` phase the server draws from stock; in
  `discard` phase it discards the highest-scoring card. In a noDiscard round
  the timeout just ends the turn holding the card (turn passes).
- Scoring: at round end every player with cards scores the sum of their hand.
  Player who went out scores 0. Lowest total after all rounds wins; ties
  share.

## 2. Data model (Postgres)

```
profiles           id (uuid = auth.uid), display_name, created_at
saved_rulesets     id, owner_id -> profiles, name, ruleset jsonb, created_at
games              id, join_code (6 chars, unique), host_id, status
                   ('lobby'|'playing'|'finished'), ruleset jsonb,
                   public_state jsonb, version int, created_at, updated_at
game_players       game_id, seat int, user_id, display_name, is_ready,
                   connected_at, PK (game_id, seat), UNIQUE (game_id, user_id)
game_hands         game_id, seat, cards jsonb, PK (game_id, seat)
game_secrets       game_id (PK), stock jsonb, rng_seed text
game_events        id bigserial, game_id, version, seat, action jsonb, created_at
```

Visibility (RLS):
- `games`, `game_players`: readable by any player in that game (and by anyone
  with the join code while `status = 'lobby'`, via a `join_game` RPC). Only
  the Edge Function (service role) writes.
- `game_hands`: `SELECT` only where `user_id` of that seat = `auth.uid()`.
- `game_secrets`: no client access at all.
- `saved_rulesets`: owner only, full CRUD.
- `profiles`: read all, write own.

`public_state` is the engine's `GameState` minus hands and stock, with
`handCounts` and `stockCount` added. The client composes `public_state` +
its own `game_hands` row into a `PlayerView`.

Realtime: clients subscribe to `postgres_changes` on `games` (row filter
`id=eq.<gameId>`), `game_players`, and their own `game_hands` row.

Edge Function `game-action`:
1. Verify JWT, load game + hands + secrets in one transaction (`SELECT … FOR UPDATE` via RPC).
2. Rebuild full `GameState`, run `reduce(ruleSet, state, action)`.
3. On error: return 400 with the engine's error code. On success: write
   `games.public_state`, `version + 1`, all changed `game_hands`,
   `game_secrets`, append to `game_events`.
4. Client sends `{ gameId, expectedVersion, action }`; a version mismatch is
   rejected so a stale client can't act.

Timers: a `pg_cron` job (every 5s) calls the Edge Function with
`{ type: 'TICK', now }` for games whose `public_state.deadline < now()`. The
engine's `TICK` action performs the auto-draw/auto-discard or advances buy
priority. Lobby-side, the host client can also fire a `TICK` as a fallback.

## 3. Engine state

```ts
type Card = { id: string; rank: Rank | 'JOKER'; suit: 'S'|'H'|'D'|'C'|'X'; deck: number };

interface Meld {
  id: string; ownerSeat: number; kind: 'set'|'run';
  cards: Card[];                      // runs are stored in order
  wildAs?: Record<cardId, { rank: Rank; suit: Suit }>;  // what each wild stands for
}

interface PlayerState {
  seat: number; userId: string; name: string;
  hand: Card[];                       // redacted to count in views
  buysLeft: number;
  hasLaidDown: boolean;
  scores: number[];                   // per round
  connected: boolean;
}

type Phase =
  | 'lobby'
  | 'dealing'
  | 'turn.draw'        // current player must draw (stock or discard)
  | 'buy.window'       // a discard is available; out-of-turn buyers may claim
  | 'turn.play'        // current player may lay down / lay off / replace wild, then discard
  | 'round.over'       // scores shown; host (or timer) advances
  | 'game.over';

interface GameState {
  version: number;
  phase: Phase;
  roundIndex: number;
  dealerSeat: number;
  currentSeat: number;
  players: PlayerState[];
  stock: Card[];                      // secret
  discard: Card[];                    // top = last
  melds: Meld[];
  buyWindow?: { discardCardId: string; order: number[]; index: number; claimedBy?: number; deadline: number };
  turnDeadline?: number;              // epoch ms
  pendingWild?: { cardId: string; seat: number };   // wild taken via replacement, must be played this turn
  hasDrawnThisTurn: boolean;
  winnerSeats?: number[];
  rngSeed: string;
}
```

## 4. Actions

| Action | Who | Allowed in phase | Notes |
|---|---|---|---|
| `JOIN {userId, name}` | anyone | lobby | assigns next free seat |
| `LEAVE` | player | lobby | frees seat |
| `SET_RULESET {ruleSet}` | host | lobby | validated |
| `READY {ready}` | player | lobby | |
| `START` | host | lobby | all ready, players within range; deals round 0 |
| `DRAW_STOCK` | current | turn.draw | closes buy window if open |
| `DRAW_DISCARD` | current | turn.draw | free, no penalty |
| `BUY` | out-of-turn eligible | buy.window | claims; resolved when window ends or priority reaches them |
| `PASS_BUY` | out-of-turn | buy.window | explicitly passes priority |
| `LAY_DOWN {melds: Card[][]}` | current | turn.play | must exactly satisfy the contract |
| `LAY_OFF {meldId, cards, position?}` | current | turn.play | only if hasLaidDown |
| `REPLACE_WILD {meldId, wildCardId, naturalCardId, playTo}` | current | turn.play | atomic with the immediate play of the wild |
| `DISCARD {cardId}` | current | turn.play | forbidden in noDiscard rounds; ends turn, opens buy window |
| `END_TURN` | current | turn.play | only in noDiscard rounds when no discard is possible |
| `REORDER_HAND {cardIds}` | player | any | cosmetic; stored in hand order |
| `NEXT_ROUND` | host | round.over | deals next round, rotates dealer |
| `TICK {now}` | server | any | timeouts: auto-draw, auto-discard, buy-priority advance |
| `RECONNECT` / `DISCONNECT` | server | any | flags only |

Errors are typed: `{ error: { code: 'NOT_YOUR_TURN' | 'WRONG_PHASE' | 'CONTRACT_NOT_MET' | 'INVALID_MELD' | 'NO_BUYS_LEFT' | 'ALREADY_LAID_DOWN' | 'LAY_OFF_NOT_ALLOWED' | 'NO_DISCARD_ROUND' | 'WILD_MUST_BE_PLAYED' | 'CARD_NOT_IN_HAND' | 'INVALID_RULESET' | 'NOT_HOST' | 'NOT_READY' | ..., message } }`.

## 5. Phase state machine

```
lobby ──START──▶ dealing ──(auto)──▶ turn.draw
                                       │
        ┌──────────────────────────────┤
        │ DRAW_STOCK / DRAW_DISCARD / TICK(auto-draw)
        ▼
   turn.play ──LAY_DOWN / LAY_OFF / REPLACE_WILD (stay)
        │
        ├─ DISCARD ────────▶ buy.window ──BUY(resolved) / PASS_BUY×all / DRAW_STOCK by next / TICK──▶ turn.draw (next seat)
        │                        (if a buyer wins: buyer gets discard+penalty, then turn.draw for next seat)
        ├─ END_TURN (noDiscard) ─────────────────────────────────────────────────────▶ turn.draw (next seat)
        └─ hand empty (went out) ──▶ round.over
                                        │
                              NEXT_ROUND (more rounds) ──▶ dealing
                              NEXT_ROUND (last round)  ──▶ game.over
```

Buy window detail: on `DISCARD`, `buyWindow.order` = seats clockwise starting
after the discarder, excluding those with 0 buys or who have laid down. The
next seat in order is the new current player and does not need to buy; they
are skipped from `order`. The window resolves when (a) the new current player
draws (the first claimant in priority wins the discard; if none, nothing), or
(b) every eligible seat has BUY/PASS'd, or (c) `TICK` passes each seat's
`buyWindowSeconds` deadline. On resolution the winner's hand gets discard +
penalty cards, `buysLeft--`, and phase becomes `turn.draw` for the current
seat (who may then only draw from stock, since the discard is gone).

## 6. Test matrix (Vitest, engine only)

Every rule is tested under three rule sets:
1. **House default** — jokers + 10s, aces either, 3 buys, 7 rounds.
2. **Classic 2s wild** — jokers + 2s, aces low, 2 buys.
3. **Custom** — 3 rounds: `[set 4, set 4]`, `[run 5]`, `[set 3, run 4, run 4] noDiscard`, 12 cards, 1 buy, 3 decks.

Suites: deck building & wild detection, scoring, set/run validity (wild
limits, adjacency, aces high/low/either, wrap-around), contract satisfaction
(exact match, no extras), lay-off validity, wild replacement (owner vs
laid-down vs stranger, must-play), buying (eligibility, priority, window,
penalty cards, stock exhaustion), going out (normal vs noDiscard), timers
(auto-draw/auto-discard), dealer rotation, full-game simulation with a seeded
RNG, and RuleSet validation.

## 7. UI screens

1. **Auth** — magic link email form.
2. **Home** — Create game / Join by code / My saved rule sets.
3. **Setup (host)** — preset picker, editable RuleSet form, contract list
   editor (drag to reorder, add/remove/edit, noDiscard toggle), "Save as…".
4. **Lobby** — join code + share button, seat list, ready toggle, start.
5. **Table** — top: round/contract, per-player chips (name, hand count,
   buys left, laid-down badge, turn indicator), melds grid; middle: stock +
   discard with Buy button and countdown; bottom: horizontal fan hand
   (tap-to-select, drag-to-reorder via pointer events), action bar
   (Draw, Lay down, Lay off, Replace wild, Discard).
6. **Round over** — scoreboard table, Next round (host).
7. **Game over** — final standings.

## 8. Build order

1. Engine + tests (this is most of the logic; UI is thin).
2. Supabase migrations, RLS, Edge Function, pg_cron tick.
3. Supabase client lib, auth, realtime hooks.
4. UI screens.
5. `netlify.toml`, `.env.example`, README with deploy steps.
