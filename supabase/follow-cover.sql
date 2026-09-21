-- Run in Supabase SQL Editor to enable the saved Follow cover preference.
alter table public.user_settings
  add column if not exists follow_cover boolean not null default false;
notify pgrst, 'reload schema';
