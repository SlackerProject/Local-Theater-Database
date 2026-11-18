-- Step 6, Michael's decision: adding awards earns no contribution points
-- (it's moderator work). The points already given for awards are removed.

delete from point_events pe
 using edit_proposals ep
 where ep.id = pe.ref_id and ep.entity_table = 'award_entries';

-- Unchanged from 20261012030000 apart from awards earning nothing
create or replace function award_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_was text := case when tg_op = 'UPDATE' then old.status::text end;
begin
  if new.status <> 'approved' or v_was = 'approved' then return new; end if;
  if tg_table_name = 'edit_proposals' then
    if new.entity_table = 'award_entries' then
      return new;
    elsif new.entity_table = 'production_submission' then
      if submission_earned_before(new.changes) then return new; end if;
      insert into point_events (user_id, amount, reason, ref_id)
      values (new.proposed_by, 10, 'production_approved', new.id) on conflict do nothing;
    elsif new.entity_table in ('productions', 'people', 'organizations', 'shows', 'locations') then
      insert into point_events (user_id, amount, reason, ref_id)
      values (new.proposed_by, 0.5, 'correction_approved', new.id) on conflict do nothing;
    else
      insert into point_events (user_id, amount, reason, ref_id)
      values (new.proposed_by, 2, 'edit_approved', new.id) on conflict do nothing;
    end if;
  elsif tg_table_name = 'media' then
    insert into point_events (user_id, amount, reason, ref_id)
    values (new.uploaded_by,
            case when new.kind = 'poster' then 3 else 2 end,
            case when new.kind = 'poster' then 'poster_approved' else 'photo_approved' end,
            new.id)
    on conflict do nothing;
  end if;
  return new;
end $$;
