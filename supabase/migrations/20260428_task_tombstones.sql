-- Tombstones for deleted brain-sourced tasks. Without these, deleting a
-- brain-minted task lets the next runDispatch re-insert the same row from
-- the same analysis (the dedup unique index only blocks duplicates while
-- the row exists). Tombstones are tiny and only written on delete.

create table if not exists agent_task_tombstones (
  team_id text not null references teams(id) on delete cascade,
  kind text not null,
  dedup_key text not null,
  deleted_at timestamptz not null default now(),
  primary key (team_id, kind, dedup_key)
);

create index if not exists idx_agent_task_tombstones_team
  on agent_task_tombstones (team_id);
