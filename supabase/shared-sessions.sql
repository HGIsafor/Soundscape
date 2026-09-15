-- Run once in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.turntable_sessions (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  playback jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.turntable_session_members (
  session_id uuid not null references public.turntable_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.turntable_commands (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.turntable_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('toggle', 'next', 'previous', 'seek')),
  position_ms integer,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists one_active_session_per_host
  on public.turntable_sessions(host_user_id) where active;

alter table public.turntable_sessions enable row level security;
alter table public.turntable_session_members enable row level security;
alter table public.turntable_commands enable row level security;

create or replace function public.is_turntable_participant(session_uuid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.turntable_sessions s
    where s.id = session_uuid and s.active and (
      s.host_user_id = auth.uid() or exists (
        select 1 from public.turntable_session_members m
        where m.session_id = s.id and m.user_id = auth.uid()
      )
    )
  );
$$;

create or replace function public.join_turntable_session(code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  select id into target from public.turntable_sessions
  where join_code = upper(trim(code)) and active limit 1;
  if target is null then raise exception 'Session not found'; end if;
  delete from public.turntable_session_members where user_id = auth.uid();
  insert into public.turntable_session_members(session_id, user_id)
  values (target, auth.uid()) on conflict do nothing;
  return target;
end;
$$;

create or replace function public.host_turntable_session(code text, initial_playback jsonb)
returns table(id uuid, join_code text, host_user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare created public.turntable_sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  update public.turntable_sessions
  set active = false, updated_at = now()
  where turntable_sessions.host_user_id = auth.uid() and active;

  insert into public.turntable_sessions (join_code, host_user_id, playback)
  values (upper(trim(code)), auth.uid(), initial_playback)
  returning * into created;

  return query select created.id, created.join_code, created.host_user_id;
end;
$$;

revoke all on function public.is_turntable_participant(uuid) from public;
grant execute on function public.is_turntable_participant(uuid) to authenticated;
revoke all on function public.join_turntable_session(text) from public;
grant execute on function public.join_turntable_session(text) to authenticated;
revoke all on function public.host_turntable_session(text, jsonb) from public;
grant execute on function public.host_turntable_session(text, jsonb) to authenticated;

drop policy if exists "participants read sessions" on public.turntable_sessions;
drop policy if exists "users host sessions" on public.turntable_sessions;
drop policy if exists "hosts update sessions" on public.turntable_sessions;
drop policy if exists "users read own membership" on public.turntable_session_members;
drop policy if exists "users leave sessions" on public.turntable_session_members;
drop policy if exists "participants create commands" on public.turntable_commands;
drop policy if exists "hosts read commands" on public.turntable_commands;
drop policy if exists "hosts update commands" on public.turntable_commands;

create policy "participants read sessions" on public.turntable_sessions for select
  using (public.is_turntable_participant(id));
create policy "users host sessions" on public.turntable_sessions for insert
  with check (host_user_id = (select auth.uid()));
create policy "hosts update sessions" on public.turntable_sessions for update
  using (host_user_id = (select auth.uid())) with check (host_user_id = (select auth.uid()));
create policy "users read own membership" on public.turntable_session_members for select
  using (user_id = (select auth.uid()));
create policy "users leave sessions" on public.turntable_session_members for delete
  using (user_id = (select auth.uid()));
create policy "participants create commands" on public.turntable_commands for insert
  with check (user_id = (select auth.uid()) and public.is_turntable_participant(session_id));
create policy "hosts read commands" on public.turntable_commands for select
  using (exists (select 1 from public.turntable_sessions s where s.id = session_id and s.host_user_id = (select auth.uid())));
create policy "hosts update commands" on public.turntable_commands for update
  using (exists (select 1 from public.turntable_sessions s where s.id = session_id and s.host_user_id = (select auth.uid())));

-- Make the new tables available to the REST API immediately.
notify pgrst, 'reload schema';
