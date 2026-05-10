-- Support efficient cross-team calendar block queries.
-- listCalendarBlocksForUser looks up blocks by teammate_id without a team_id
-- filter, so the existing (team_id, teammate_id, starts_at, ends_at) index
-- doesn't help. This index makes that query fast.
create index if not exists idx_teammate_calendar_blocks_teammate
  on teammate_calendar_blocks (teammate_id, starts_at, ends_at);
