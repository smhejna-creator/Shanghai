-- Guests (anonymous auth users) and bot players.

-- Bots are seats without an auth user, so seats/hands no longer reference profiles.
alter table public.game_players drop constraint if exists game_players_user_id_fkey;
alter table public.game_hands drop constraint if exists game_hands_user_id_fkey;

-- Anonymous users have no email; fall back to a friendly default.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Guest'))
  on conflict (id) do nothing;
  return new;
end $$;
