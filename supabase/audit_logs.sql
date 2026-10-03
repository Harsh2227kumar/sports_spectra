-- Apply this migration in Supabase SQL Editor for an existing Sports Spectra database.
-- It adds the dedicated audit trail and keeps activity_logs as the activity feed.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  category text not null default 'AUCTION',
  actor text not null default 'Admin',
  details text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_audit_logs_created_at
  on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_action
  on public.audit_logs (action_type);

-- Preserve existing activity history in the new audit table when this is applied.
insert into public.audit_logs (action_type, category, actor, details, metadata, created_at)
select action_type, category, actor, details, metadata, created_at
from public.activity_logs old_log
where not exists (
  select 1 from public.audit_logs existing
  where existing.action_type = old_log.action_type
    and existing.category = old_log.category
    and existing.actor = old_log.actor
    and existing.details = old_log.details
    and existing.created_at = old_log.created_at
);

alter table public.audit_logs enable row level security;

drop policy if exists "Anyone can read audit_logs" on public.audit_logs;
create policy "Anyone can read audit_logs"
  on public.audit_logs for select using (true);
drop policy if exists "Admins can insert audit_logs" on public.audit_logs;
create policy "Admins can insert audit_logs"
  on public.audit_logs for insert with check (true);
drop policy if exists "Admins can delete audit_logs" on public.audit_logs;
create policy "Admins can delete audit_logs"
  on public.audit_logs for delete using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audit_logs'
  ) then
    alter publication supabase_realtime add table public.audit_logs;
  end if;
end
$$;
