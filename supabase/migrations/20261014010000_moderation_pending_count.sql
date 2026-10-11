-- =====================================================================
-- Local Theater Database: migration 0022
-- How many decisions are waiting for a moderator
--
--   * moderation_pending_count(): everything in the review queue that
--     needs a decision: pending production submissions, corrections,
--     audition dates and award entries (edit_proposals), photos, posters
--     and headshots (media), claims of person pages, and disputed page
--     changes. Moderators see it as a red badge on their account menu.
--     Anyone else gets 0.
-- Runs after 0021 (20261014000000_audition_labels_locations.sql).
-- =====================================================================

create or replace function moderation_pending_count() returns int
language sql stable security definer set search_path = public as $$
  select case when not has_role('moderator') then 0 else (
      (select count(*) from edit_proposals where status = 'pending'
         and entity_table in ('production_submission', 'auditions', 'award_entries',
                              'productions', 'people', 'organizations', 'shows', 'locations'))
    + (select count(*) from media where status = 'pending')
    + (select count(*) from person_claims where status = 'pending')
    + (select count(*) from notifications where status = 'disputed')
  )::int end;
$$;

revoke execute on function moderation_pending_count() from public, anon;
grant execute on function moderation_pending_count() to authenticated;
