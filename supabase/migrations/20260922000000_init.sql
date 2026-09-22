-- Shanghai schema. Clients only READ game tables; the game-action Edge Function
-- (service role) is the only writer.

create extension if not exists pgcrypto;
create extension if not exists pg_net;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles readable by signed-in users" on public.profiles for select to authenticated using (true);
create policy "profiles editable by owner" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles insertable by owner" on public.profiles for insert to authenticated with check (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- saved rule sets ----------
create table public.saved_rulesets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  ruleset jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_rulesets_owner_idx on public.saved_rulesets (owner_id);
alter table public.saved_rulesets enable row level security;
create policy "own rulesets" on public.saved_rulesets for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- games ----------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique,
  host_id uuid not null references public.profiles (id),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  ruleset jsonb not null,
  public_state jsonb not null,
  version integer not null default 0,
  deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index games_deadline_idx on public.games (deadline) where status = 'playing';

create table public.game_players (
  game_id uuid not null references public.games (id) on delete cascade,
  seat integer not null,
  user_id uuid not null references public.profiles (id),
  display_name text not null,
  is_ready boolean not null default false,
  connected_at timestamptz,
  primary key (game_id, seat),
  unique (game_id, user_id)
);
create index game_players_user_idx on public.game_players (user_id);

create table public.game_hands (
  game_id uuid not null references public.games (id) on delete cascade,
  seat integer not null,
  user_id uuid not null references public.profiles (id),
  cards jsonb not null default '[]'::jsonb,
  version integer not null default 0,
  primary key (game_id, seat)
);

create table public.game_secrets (
  game_id uuid primary key references public.games (id) on delete cascade,
  stock jsonb not null default '[]'::jsonb,
  rng_seed text not null
);

create table public.game_events (
  id bigserial primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  version integer not null,
  user_id uuid,
  action jsonb not null,
  created_at timestamptz not null default now()
);
create index game_events_game_idx on public.game_events (game_id, version);

-- Membership helper (security definer so it can be used inside policies without recursion).
create or replace function public.is_game_member(g uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.game_players gp where gp.game_id = g and gp.user_id = auth.uid());
$$;

alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_hands enable row level security;
alter table public.game_secrets enable row level security;
alter table public.game_events enable row level security;

-- Members can read the game and its seats. Nobody but the service role writes.
create policy "members read games" on public.games for select to authenticated using (public.is_game_member(id));
create policy "members read players" on public.game_players for select to authenticated using (public.is_game_member(game_id));
create policy "members read events" on public.game_events for select to authenticated using (public.is_game_member(game_id));
-- A player sees only their own hand.
create policy "own hand only" on public.game_hands for select to authenticated using (user_id = auth.uid());
-- game_secrets: no policies => no client access at all.

-- Realtime
alter publication supabase_realtime add table public.games, public.game_players, public.game_hands;
alter table public.games replica identity full;
alter table public.game_hands replica identity full;

-- Lobby lookup by join code without exposing the game row: returns only id/status/name.
create or replace function public.lookup_game(code text)
returns table (id uuid, status text, host_name text, player_count integer, ruleset_name text)
language sql security definer stable set search_path = public as $$
  select g.id, g.status, p.display_name, (select count(*)::int from public.game_players gp where gp.game_id = g.id), g.ruleset ->> 'name'
  from public.games g join public.profiles p on p.id = g.host_id
  where upper(g.join_code) = upper(code);
$$;

-- Games this user is in (for "rejoin" on the home screen).
create or replace function public.my_games()
returns table (id uuid, join_code text, status text, ruleset_name text, updated_at timestamptz)
language sql security definer stable set search_path = public as $$
  select g.id, g.join_code, g.status, g.ruleset ->> 'name', g.updated_at
  from public.games g join public.game_players gp on gp.game_id = g.id
  where gp.user_id = auth.uid() and g.status <> 'finished'
  order by g.updated_at desc limit 20;
$$;

-- Atomic, version-checked write used by the Edge Function (service role only).
create or replace function public.apply_game_update(
  p_game_id uuid,
  p_expected_version integer,
  p_new_version integer,
  p_status text,
  p_ruleset jsonb,
  p_public_state jsonb,
  p_deadline timestamptz,
  p_hands jsonb,      -- [{seat, user_id, cards}]
  p_players jsonb,    -- [{seat, user_id, display_name, is_ready, connected}]
  p_stock jsonb,
  p_event jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  updated integer;
  h jsonb;
begin
  update public.games
    set version = p_new_version, status = p_status, ruleset = p_ruleset, public_state = p_public_state,
        deadline = p_deadline, updated_at = now()
    where id = p_game_id and version = p_expected_version;
  get diagnostics updated = row_count;
  if updated = 0 then
    return false;
  end if;

  delete from public.game_players where game_id = p_game_id;
  insert into public.game_players (game_id, seat, user_id, display_name, is_ready, connected_at)
    select p_game_id, (x ->> 'seat')::int, (x ->> 'user_id')::uuid, x ->> 'display_name', (x ->> 'is_ready')::boolean,
           case when (x ->> 'connected')::boolean then now() else null end
    from jsonb_array_elements(p_players) x;

  delete from public.game_hands where game_id = p_game_id;
  for h in select * from jsonb_array_elements(p_hands) loop
    insert into public.game_hands (game_id, seat, user_id, cards, version)
      values (p_game_id, (h ->> 'seat')::int, (h ->> 'user_id')::uuid, h -> 'cards', p_new_version);
  end loop;

  update public.game_secrets set stock = p_stock where game_id = p_game_id;
  insert into public.game_events (game_id, version, user_id, action)
    values (p_game_id, p_new_version, nullif(p_event ->> 'userId', '')::uuid, p_event);
  return true;
end $$;
revoke all on function public.apply_game_update from public, anon, authenticated;

-- ---------- timers: pg_cron calls the Edge Function every 5 seconds ----------
-- Requires the vault secrets `game_action_url` and `game_action_secret` to be set:
--   select vault.create_secret('https://<ref>.functions.supabase.co/game-action', 'game_action_url');
--   select vault.create_secret('<GAME_TICK_SECRET>', 'game_action_secret');
create extension if not exists pg_cron;
create or replace function public.tick_games() returns void
language plpgsql security definer set search_path = public as $$
declare
  url text;
  secret text;
  g record;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'game_action_url' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'game_action_secret' limit 1;
  if url is null or secret is null then return; end if;
  for g in select id from public.games where status = 'playing' and deadline is not null and deadline <= now() loop
    perform net.http_post(
      url := url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-tick-secret', secret),
      body := jsonb_build_object('op', 'tick', 'gameId', g.id)
    );
  end loop;
end $$;
select cron.schedule('shang-hi-tick', '5 seconds', $$select public.tick_games()$$);
