create table if not exists registration_waitlist (
  id                text primary key,
  email             text not null unique check (email = lower(email)),
  nickname          text,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at      timestamptz not null default now(),
  approved_at       timestamptz,
  approved_by_email text,
  updated_at        timestamptz not null default now()
);

create index if not exists registration_waitlist_status_requested_idx
  on registration_waitlist (status, requested_at desc);

alter table registration_waitlist enable row level security;
alter table registration_waitlist force row level security;
