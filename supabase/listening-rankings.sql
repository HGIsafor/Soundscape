-- Run once in Supabase Dashboard > SQL Editor.
-- Two snapshots per account/chart: today's first successful load and the
-- previous saved day (which may be older than yesterday).
create table if not exists public.listening_rankings (
  user_id uuid not null references auth.users(id) on delete cascade,
  section text not null check (section in ('tracks', 'artists')),
  time_range text not null check (time_range in ('short_term', 'medium_term', 'long_term')),
  entries jsonb not null,
  captured_at timestamptz not null,
  previous_entries jsonb,
  previous_at timestamptz,
  primary key (user_id, section, time_range)
);

alter table public.listening_rankings enable row level security;
revoke all on public.listening_rankings from anon, authenticated;

-- All access uses the signed-in account. Clients cannot set dates or rewrite
-- today's snapshot. The row lock also makes simultaneous device visits safe.
create or replace function public.listening_chart(
  p_section text, p_range text, p_entries jsonb default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_chart public.listening_rankings;
  v_now timestamptz := statement_timestamp();
begin
  if v_user is null then raise exception 'Sign in to save listening charts'; end if;
  if p_section not in ('tracks', 'artists') or p_range not in ('short_term', 'medium_term', 'long_term') then
    raise exception 'Invalid chart';
  end if;
  if p_entries is not null then
    if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 50
       or octet_length(p_entries::text) > 524288 then
      raise exception 'Invalid chart entries';
    end if;
    insert into public.listening_rankings as existing
      (user_id, section, time_range, entries, captured_at)
    values (v_user, p_section, p_range, p_entries, v_now)
    on conflict (user_id, section, time_range) do update set
      previous_entries = existing.entries,
      previous_at = existing.captured_at,
      entries = excluded.entries,
      captured_at = excluded.captured_at
    where (existing.captured_at at time zone 'UTC')::date < (v_now at time zone 'UTC')::date;
  end if;
  select * into v_chart from public.listening_rankings
    where user_id = v_user and section = p_section and time_range = p_range;
  if not found then return null; end if;
  return jsonb_build_object(
    'entries', v_chart.entries, 'capturedAt', v_chart.captured_at,
    'previousEntries', v_chart.previous_entries, 'previousAt', v_chart.previous_at,
    'isCurrent', (v_chart.captured_at at time zone 'UTC')::date = (v_now at time zone 'UTC')::date
  );
end;
$$;

revoke all on function public.listening_chart(text, text, jsonb) from public, anon;
grant execute on function public.listening_chart(text, text, jsonb) to authenticated;
