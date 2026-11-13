-- =====================================================================
-- Local Theater Database: migration 0043
-- A tickets link with a new production
--
--   The Add form and the Bulk Upload template can include the
--   production's tickets link (production.ticket_url in the bundle). It's
--   saved on approval when it's a web address and the production has none
--   yet. Otherwise approve_submission_checked() is as in 0028.
-- Runs after 0042 (20261113010000_bulk_replace_atomic.sql).
-- =====================================================================

create or replace function approve_submission_checked(
  p_proposal_id uuid,
  p_bundle      jsonb default null,
  p_left_out    jsonb default null,
  p_note        text  default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  v_prod uuid;
  v_show uuid;
  v_role text;
begin
  for v in select * from jsonb_array_elements(coalesce(p_bundle -> 'people', '[]')) loop
    if coalesce((v -> 'new' ->> 'distinct')::boolean, false) then
      perform allow_distinct_person(v -> 'new' ->> 'display_name');
    end if;
  end loop;
  v_prod := approve_submission(p_proposal_id, p_bundle, p_left_out, p_note);

  -- The tickets link, if one came with it (and none is set yet)
  if coalesce(p_bundle -> 'production' ->> 'ticket_url', '') ~* '^https?://[^ ]+$' then
    update productions set ticket_url = left(trim(p_bundle -> 'production' ->> 'ticket_url'), 500)
     where id = v_prod and ticket_url is null;
  end if;

  -- Roles not cast yet join the show's role list
  select show_id into v_show from productions where id = v_prod;
  for v in select * from jsonb_array_elements(case when jsonb_typeof(p_bundle -> 'roles') = 'array' then p_bundle -> 'roles' else '[]' end) loop
    v_role := nullif(left(regexp_replace(trim(v #>> '{}'), '\s+', ' ', 'g'), 100), '');
    continue when v_role is null
      or exists (select 1 from show_characters where show_id = v_show and lower(name) = lower(v_role));
    insert into show_characters (show_id, name, sort_order)
    values (v_show, v_role, (select coalesce(max(sort_order), 0) + 1 from show_characters where show_id = v_show));
  end loop;

  return v_prod;
end $$;
