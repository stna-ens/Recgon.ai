-- Invite flow is now link-only: anyone with the single-use invite link can
-- join the team. The invitee's email is no longer required at invite time
-- (it was never verified against the accepting user anyway — accepting an
-- invite only requires a valid, unused token + an authenticated session).
--
-- Existing invitations retain their email; new invitations are created with
-- email = NULL.

alter table team_invitations
  alter column email drop not null;
