-- =====================================================================
-- Local Theater Database: migration 0042
-- Bulk upload "Replace" in one step: clearing the production and adding
-- the file's cast, crew and dates happen together, so a problem leaves
-- the production as it was.
-- Runs after 0041 (20261113000000_bulk_upload.sql).
-- =====================================================================

create or replace function bulk_replace_production(
  p_proposal_id uuid, p_bundle jsonb, p_opening date, p_closing date, p_clear_venue boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('moderator') then raise exception 'Only moderators can bulk upload'; end if;
  perform bulk_reset_production((p_bundle -> 'production' ->> 'id')::uuid, p_opening, p_closing, p_clear_venue);
  return approve_submission_checked(p_proposal_id, p_bundle, null, null);
end $$;

revoke execute on function bulk_replace_production(uuid, jsonb, date, date, boolean) from public, anon;
grant execute on function bulk_replace_production(uuid, jsonb, date, date, boolean) to authenticated;
