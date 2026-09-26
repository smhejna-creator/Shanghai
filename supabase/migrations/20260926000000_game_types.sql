-- Multiple games share the same tables; each game row says which engine runs it.
alter table public.games add column if not exists game_type text not null default 'shanghai'
  check (game_type in ('shanghai', 'swoop'));

drop function if exists public.lookup_game(text);
create or replace function public.lookup_game(code text)
returns table (id uuid, status text, host_name text, player_count integer, ruleset_name text, game_type text)
language sql security definer stable set search_path = public as $$
  select g.id, g.status, p.display_name, (select count(*)::int from public.game_players gp where gp.game_id = g.id), g.ruleset ->> 'name', g.game_type
  from public.games g join public.profiles p on p.id = g.host_id
  where upper(g.join_code) = upper(code);
$$;

drop function if exists public.my_games();
create or replace function public.my_games()
returns table (id uuid, join_code text, status text, ruleset_name text, updated_at timestamptz, game_type text)
language sql security definer stable set search_path = public as $$
  select g.id, g.join_code, g.status, g.ruleset ->> 'name', g.updated_at, g.game_type
  from public.games g join public.game_players gp on gp.game_id = g.id
  where gp.user_id = auth.uid() and g.status <> 'finished'
  order by g.updated_at desc limit 20;
$$;
