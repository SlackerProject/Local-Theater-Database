-- =====================================================================
-- Local Theater Database: migration 0005
-- Points: once per submission, not again for resubmissions
--
-- A submission earns 5 points the first time it's approved (a partial
-- approval counts). "Fix and resubmit" creates a new edit_proposal whose
-- bundle has "resubmission_of": <earlier proposal id>. When that is
-- approved, no points are awarded if any earlier version in the chain
-- already earned them. If every earlier version was rejected, the first
-- approval still earns the 5 points.
-- Photo approvals (media) are unchanged.
-- Runs after 0004 (20261010210000_partial_approval.sql).
-- =====================================================================

create or replace function award_points() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    if tg_table_name = 'edit_proposals' then
      if new.entity_table = 'production_submission' and exists (
        -- Walk back through resubmission_of links (bounded, in case of a loop)
        with recursive chain (id, depth) as (
          select case when new.changes ->> 'resubmission_of' ~* '^[0-9a-f-]{36}$'
                      then (new.changes ->> 'resubmission_of')::uuid end, 1
          union all
          select case when ep.changes ->> 'resubmission_of' ~* '^[0-9a-f-]{36}$'
                      then (ep.changes ->> 'resubmission_of')::uuid end, c.depth + 1
          from chain c
          join edit_proposals ep on ep.id = c.id
          where c.depth < 50
        )
        select 1
        from chain c
        join point_events pe on pe.ref_id = c.id and pe.reason = 'edit_approved'
      ) then
        return new;  -- an earlier version of this submission already earned its points
      end if;
      insert into point_events (user_id, amount, reason, ref_id)
      values (new.proposed_by, 5, 'edit_approved', new.id);
    elsif tg_table_name = 'media' then
      insert into point_events (user_id, amount, reason, ref_id)
      values (new.uploaded_by, 2, 'photo_approved', new.id);
    end if;
  end if;
  return new;
end $$;
