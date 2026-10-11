-- =====================================================================
-- Local Theater Database: migration 0012
-- Seen counts on person pages, and suggested edits on any page
--
-- Adds:
--   * seen_count(): how many productions a verified person's account has
--     marked Seen (watch_list stays private; only the total is public).
--   * resolve_suggestion(): moderators mark a suggested edit (a note on a
--     production, company, show, venue or person page) done or dismissed.
--     Members send these as ordinary edit_proposals rows.
-- Runs after 0011 (20261011040000_auditions_and_deleting.sql).
-- =====================================================================

create or replace function seen_count(p_person_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
  from people pe
  join watch_list w on w.user_id = pe.verified_owner_id and w.status = 'seen'
  where pe.id = p_person_id;
$$;

create or replace function resolve_suggestion(p_proposal_id uuid, p_done boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('moderator') then raise exception 'Only moderators can review suggestions'; end if;
  update edit_proposals
     set status = case when p_done then 'approved' else 'rejected' end::moderation_status,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
   where id = p_proposal_id and status = 'pending'
     and entity_table in ('productions', 'organizations', 'shows', 'locations', 'people');
  if not found then raise exception 'Suggestion not found or already reviewed'; end if;
end $$;

revoke execute on function resolve_suggestion(uuid, boolean, text) from public, anon;
grant execute on function resolve_suggestion(uuid, boolean, text) to authenticated;
grant execute on function seen_count(uuid) to anon, authenticated;
