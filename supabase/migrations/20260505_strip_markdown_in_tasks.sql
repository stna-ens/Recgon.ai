-- Strip leftover markdown literals (`**bold**`, `__bold__`, backticks) from
-- existing agent_tasks rows. Going forward, lib/recgon/storage.ts createTask
-- runs stripMd on title + description at insert time, so the DB can never
-- accept dirty rows again. This migration just cleans up history.

UPDATE agent_tasks
SET
  title = TRIM(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(title, '(\*\*|__)(.+?)\1', '\2', 'g'),
        '`([^`]+)`', '\1', 'g'),
      '\*\*|__', '', 'g'),
    '`', '', 'g')),
  description = TRIM(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(description, '(\*\*|__)(.+?)\1', '\2', 'g'),
        '`([^`]+)`', '\1', 'g'),
      '\*\*|__', '', 'g'),
    '`', '', 'g'))
WHERE title ~ '\*\*|__|`' OR description ~ '\*\*|__|`';
