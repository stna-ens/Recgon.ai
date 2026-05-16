-- Drop owner_dock_dismissals table.
--
-- Phase 3.5 (Owner Task Board) was implemented and then reversed on 2026-05-16.
-- The create migration (20260517_owner_dock_dismissals.sql) was applied to live
-- Supabase before the reversal decision, so the table now exists but no code
-- references it. Drop it to keep the schema clean.

drop table if exists public.owner_dock_dismissals;
