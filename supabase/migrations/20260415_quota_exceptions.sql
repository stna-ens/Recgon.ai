-- Exception list for analysis quota enforcement.
-- Users listed here bypass both the lifetime cap and the cooldown.
-- Manage rows directly in the Supabase dashboard or via SQL.

create table if not exists quota_exceptions (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  reason     text,
  created_at timestamptz not null default now()
);

comment on table quota_exceptions is
  'Users in this table are exempt from analysis quota limits (lifetime cap + cooldown).';

-- Lowercase index for case-insensitive lookups
create unique index if not exists quota_exceptions_email_lower_idx
  on quota_exceptions (lower(email));
