# Winning Hand

Online multiplayer card room: Shanghai Rummy (contract rummy) and Swoop. Vite + React + TypeScript + Tailwind on the
client, Supabase (magic-link auth, Postgres, Realtime, Edge Functions) on the server, deployed to
Netlify. See `PLAN.md` for the design.

```
src/engine              pure game engine (no React / Supabase) + Vitest suites
src/ui                  screens and components
src/lib/supabase        client, API wrapper, auth + game hooks
supabase/migrations     schema, RLS, realtime, pg_cron tick
supabase/functions      game-action Edge Function (validates every action with the engine)
```

## Local development

```bash
npm install
cp .env.example .env        # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm test                    # engine tests across three rule sets
npm run dev
```

## Supabase setup

1. Create a project and enable **Email** auth with magic links. Add your Netlify URL (and
   `http://localhost:5173`) to *Authentication → URL configuration → Redirect URLs*.
2. Apply the schema: `supabase link --project-ref <ref>` then `npm run db:push`.
3. Deploy the Edge Function: `npm run deploy:functions` (this first copies `src/engine` into
   `supabase/functions/_shared/engine` so the server runs the identical reducer).
4. Set the function secret used by the timer job:
   `supabase secrets set GAME_TICK_SECRET=<random string>`.
5. Store the tick endpoint + secret in Vault so `pg_cron` can call the function every 5 s:
   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/game-action', 'game_action_url');
   select vault.create_secret('<random string>', 'game_action_secret');
   ```
   Clients also poke the clock when a deadline passes, so timers work even before this step.

## Netlify

Connect the repo; `netlify.toml` sets the build command, SPA redirect, and Node version. Add the
two `VITE_SUPABASE_*` environment variables in the site settings.

## Rules

Everything rule-related lives in a `RuleSet` (see `src/engine/ruleset.ts`): players, decks,
wilds, ordered contracts (editable, reorderable, per-round "no discard"), cards and buys per
round, ace handling, lay-off and wild-replacement policy, scoring, and the turn timer. Presets:
**House default** (jokers + 10s, aces either, 3 buys) and **Classic 2s wild** (jokers + 2s, aces
low, 2 buys). Hosts can save named rule sets to their profile.
