create table if not exists rate_limits (
  key text primary key,
  count integer not null default 1,
  reset_at bigint not null
);
