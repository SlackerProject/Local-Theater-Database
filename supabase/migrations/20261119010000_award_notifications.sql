-- Step 6: people who follow a person hear when that person is nominated or
-- wins. One notification per follower per nomination, and another if it
-- turns into a win. Young performers are never named, so never announced.
-- Nominations already saved before today don't announce anything.

alter table notifications add column award_entry_id uuid references award_entries(id) on delete cascade;

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('page_changed', 'cast_announcement', 'company_announcement', 'auditions_announced', 'site_update', 'feedback_reply',
                  'award_nomination', 'award_win'));

create unique index notifications_one_per_award
  on notifications (user_id, award_entry_id, kind) where award_entry_id is not null;

create or replace function announce_award() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text := case when new.result = 'won' then 'award_win' else 'award_nomination' end;
begin
  if new.person_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.result is not distinct from old.result and new.person_id is not distinct from old.person_id then
    return new;
  end if;
  -- A win taken back (ticked by mistake): withdraw the unread win note
  if tg_op = 'UPDATE' and v_kind = 'award_nomination' then
    delete from notifications where award_entry_id = new.id and kind = 'award_win' and status = 'unread';
    return new;
  end if;
  insert into notifications (user_id, kind, production_id, person_id, award_entry_id)
  select f.user_id, v_kind, new.production_id, new.person_id, new.id
    from follows f
   where f.person_id = new.person_id
  on conflict do nothing;
  -- A win replaces the unread "nominated" note
  if v_kind = 'award_win' then
    delete from notifications where award_entry_id = new.id and kind = 'award_nomination' and status = 'unread';
  end if;
  return new;
end $$;

create trigger award_entries_announce after insert or update of result, person_id on award_entries
  for each row execute function announce_award();
