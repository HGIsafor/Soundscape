-- Run once in Supabase Dashboard > SQL Editor.
alter table public.user_settings
  add column if not exists favorite_color text not null default '#1ed760';

alter table public.user_settings
  drop constraint if exists user_settings_favorite_color_check;

alter table public.user_settings
  add constraint user_settings_favorite_color_check
  check (favorite_color ~ '^#[0-9A-Fa-f]{6}$');

notify pgrst, 'reload schema';
