-- "This is the same person (show, company, venue, production) as another
-- page": a member points a moderator at a duplicate, with an optional reason
-- such as "former last name". It waits in the Corrections queue as
-- {"fields": {}, "same_as": "<the other page's id>"}, where a moderator
-- merges the two or says they're different.

create or replace function report_same_page(p_table text, p_id uuid, p_other uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_found int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_table not in ('people', 'shows', 'organizations', 'locations', 'productions') then raise exception 'That page can’t be merged'; end if;
  if p_id = p_other then raise exception 'Choose a different page'; end if;
  execute format('select count(*) from %I where id = any($1)', p_table) into v_found using array[p_id, p_other];
  if v_found <> 2 then raise exception 'That page no longer exists'; end if;
  if exists (select 1 from edit_proposals
              where entity_table = p_table and status = 'pending'
                and ((entity_id = p_id and changes ->> 'same_as' = p_other::text) or (entity_id = p_other and changes ->> 'same_as' = p_id::text))) then
    raise exception 'Someone has already sent this. A moderator will check it soon.';
  end if;
  insert into edit_proposals (entity_table, entity_id, changes, note, proposed_by)
  values (p_table, p_id, jsonb_build_object('fields', '{}'::jsonb, 'same_as', p_other), nullif(trim(left(p_note, 500)), ''), auth.uid());
end $$;

revoke execute on function report_same_page(text, uuid, uuid, text) from public, anon;
grant execute on function report_same_page(text, uuid, uuid, text) to authenticated;
