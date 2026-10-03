-- Add the player contact field to existing Supabase projects.
-- Safe to run multiple times.
alter table public.players
  add column if not exists phone_no text;

comment on column public.players.phone_no is
  'Player contact phone number';
