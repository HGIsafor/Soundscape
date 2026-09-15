-- Run this file once in Supabase Dashboard > SQL Editor.
-- Spotify connections belong to Soundscape users and are removed with them.
create table if not exists public.spotify_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.spotify_connections enable row level security;

drop policy if exists "users read own spotify connection" on public.spotify_connections;
drop policy if exists "users create own spotify connection" on public.spotify_connections;
drop policy if exists "users update own spotify connection" on public.spotify_connections;
drop policy if exists "users delete own spotify connection" on public.spotify_connections;

create policy "users read own spotify connection"
  on public.spotify_connections for select
  using ((select auth.uid()) = user_id);
create policy "users create own spotify connection"
  on public.spotify_connections for insert
  with check ((select auth.uid()) = user_id);
create policy "users update own spotify connection"
  on public.spotify_connections for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "users delete own spotify connection"
  on public.spotify_connections for delete
  using ((select auth.uid()) = user_id);
