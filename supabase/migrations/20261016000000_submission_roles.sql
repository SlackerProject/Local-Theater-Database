-- =====================================================================
-- Local Theater Database: migration 0027
-- Roles not cast yet, sent with a new production
--
-- The Add a production form now lists the show's roles like the edit
-- page, including roles nobody is cast in yet. Those arrive as
-- bundle.roles (["Lord Adalbert", ...]) and are added to the show's role
-- list when the submission is approved. Otherwise as in
-- 20261014030000_no_duplicate_people.sql.
-- Runs after 0026 (20261015000000_credit_counts.sql).
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
