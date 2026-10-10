-- =====================================================================
-- Local Theater Database: migration 0006
-- Design v2: show colors, and authors on new shows
--
-- Changes:
--   * productions.color_ground, color_ground_2, color_ink, color_soft,
--     color_accent: the palette computed once from the production's poster
--     (see design-reference-v2/DESIGN.md). All five are set together or not
--     at all; null means "no poster", and pages fall back to the plain
--     black-and-white look.
--   * approve_submission() now also saves a new show's authors
--     ("Book by ... · Music by ..."), which the form and moderators can enter.
--     The rest of the function is unchanged from 0004.
-- Runs after 0005 (20261010220000_points_once_per_submission.sql).
-- =====================================================================

alter table productions
  add column color_ground   text check (color_ground   ~ '^#[0-9A-F]{6}$'),
  add column color_ground_2 text check (color_ground_2 ~ '^#[0-9A-F]{6}$'),
  add column color_ink      text check (color_ink      ~ '^#[0-9A-F]{6}$'),
  add column color_soft     text check (color_soft     ~ '^#[0-9A-F]{6}$'),
  add column color_accent   text check (color_accent   ~ '^#[0-9A-F]{6}$'),
  add constraint productions_palette_complete check (
    num_nulls(color_ground, color_ground_2, color_ink, color_soft, color_accent) in (0, 5));
create or replace function approve_submission(
  p_proposal_id uuid,
  p_bundle      jsonb default null,   -- the corrected bundle; null = approve as submitted
  p_left_out    jsonb default null,   -- {"location"?, "performances": [], "people": [], "credits": []}
  p_note        text  default null)   -- shown to the contributor
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_prop    edit_proposals;
  b         jsonb;
  v_user    uuid;
  v_show    uuid;
  v_org     uuid;
  v_loc     uuid;
  v_prod    uuid;
  v_title   text;
  v_orgname text;
  v_year    smallint;
  v_entries jsonb := '{}'::jsonb;   -- person key -> people[] entry from the bundle
  v_people  jsonb := '{}'::jsonb;   -- person key -> created or existing person id
  v_item    jsonb;
  v_key     text;
  v_person  uuid;
  v_char    uuid;
  v_role    text;
  v_cast_n  int;
  v_crew_n  int;
  v_left    jsonb;
begin
  if not has_role('moderator') then
    raise exception 'Only moderators can approve submissions';
  end if;

  select * into v_prop from edit_proposals where id = p_proposal_id for update;
  if not found or v_prop.entity_table <> 'production_submission' then
    raise exception 'Submission not found';
  end if;
  if v_prop.status <> 'pending' then
    raise exception 'This submission has already been reviewed';
  end if;

  b := coalesce(p_bundle, v_prop.changes);
  v_user := v_prop.proposed_by;

  if b -> 'production' ? 'id' then
    -- ---------------------------------------------------------------
    -- Adding to an existing production
    -- ---------------------------------------------------------------
    select id, show_id, location_id into v_prod, v_show, v_loc
      from productions where id = (b -> 'production' ->> 'id')::uuid;
    if v_prod is null then raise exception 'That production no longer exists'; end if;

  else
    -- ---------------------------------------------------------------
    -- A new production: show, company, optional location, production
    -- ---------------------------------------------------------------
    if b -> 'show' ? 'id' then
      select id, title into v_show, v_title from shows where id = (b -> 'show' ->> 'id')::uuid;
      if v_show is null then raise exception 'The selected show no longer exists'; end if;
    else
      v_title := nullif(trim(b -> 'show' -> 'new' ->> 'title'), '');
      if v_title is null then raise exception 'The show needs a title'; end if;
      insert into shows (slug, title, subtitle, authors, type, created_by)
      values (unique_slug('shows', v_title), v_title,
              nullif(trim(b -> 'show' -> 'new' ->> 'subtitle'), ''),
              nullif(trim(b -> 'show' -> 'new' ->> 'authors'), ''),
              coalesce(nullif(b -> 'show' -> 'new' ->> 'type', ''), 'other')::show_type,
              v_user)
      returning id into v_show;
    end if;

    if b -> 'organization' ? 'id' then
      select id, name into v_org, v_orgname from organizations where id = (b -> 'organization' ->> 'id')::uuid;
      if v_org is null then raise exception 'The selected company no longer exists'; end if;
    else
      v_orgname := nullif(trim(b -> 'organization' -> 'new' ->> 'name'), '');
      if v_orgname is null then raise exception 'The company needs a name'; end if;
      insert into organizations (slug, name, town, website_url, created_by)
      values (unique_slug('organizations', v_orgname), v_orgname,
              nullif(trim(b -> 'organization' -> 'new' ->> 'town'), ''),
              nullif(trim(b -> 'organization' -> 'new' ->> 'website_url'), ''),
              v_user)
      returning id into v_org;
    end if;

    v_year := (b -> 'production' ->> 'year')::smallint;
    if v_year is null then raise exception 'The production needs a year'; end if;

    insert into productions (slug, show_id, organization_id, year, opening_date, closing_date, created_by)
    values (
      unique_slug('productions', v_title || ' ' || v_orgname || ' ' || v_year),
      v_show, v_org, v_year,
      coalesce(nullif(b -> 'production' ->> 'opening_date', '')::date,
               (select min((p ->> 'date')::date) from jsonb_array_elements(coalesce(b -> 'performances', '[]')) p)),
      coalesce(nullif(b -> 'production' ->> 'closing_date', '')::date,
               (select max((p ->> 'date')::date) from jsonb_array_elements(coalesce(b -> 'performances', '[]')) p)),
      v_user)
    returning id into v_prod;
  end if;

  -- Location (new productions, or an existing one that has none yet)
  if jsonb_typeof(b -> 'location') = 'object' and v_loc is null then
    if b -> 'location' ? 'id' then
      select id into v_loc from locations where id = (b -> 'location' ->> 'id')::uuid;
      if v_loc is null then raise exception 'The selected location no longer exists'; end if;
    elsif nullif(trim(b -> 'location' -> 'new' ->> 'name'), '') is not null then
      insert into locations (slug, name, street_address, town, created_by)
      values (unique_slug('locations', b -> 'location' -> 'new' ->> 'name'),
              trim(b -> 'location' -> 'new' ->> 'name'),
              nullif(trim(b -> 'location' -> 'new' ->> 'street_address'), ''),
              nullif(trim(b -> 'location' -> 'new' ->> 'town'), ''),
              v_user)
      returning id into v_loc;
    end if;
    if v_loc is not null then
      update productions set location_id = v_loc where id = v_prod;
      insert into organization_locations (organization_id, location_id)
      select organization_id, v_loc from productions where id = v_prod
      on conflict do nothing;
    end if;
  end if;

  -- Performances (local Massachusetts time)
  for v_item in select * from jsonb_array_elements(coalesce(b -> 'performances', '[]')) loop
    insert into performances (production_id, starts_at, label)
    values (v_prod,
            ((v_item ->> 'date')::date + coalesce(nullif(v_item ->> 'time', ''), '19:30')::time)
              at time zone 'America/New_York',
            nullif(trim(v_item ->> 'label'), ''))
    on conflict (production_id, starts_at) do nothing;
  end loop;

  -- People are looked up by key and created only when a credit uses them
  for v_item in select * from jsonb_array_elements(coalesce(b -> 'people', '[]')) loop
    v_entries := v_entries || jsonb_build_object(v_item ->> 'key', v_item);
  end loop;

  -- Continue billing order after any existing credits
  select coalesce(max(billing_order) filter (where kind = 'cast'), 0),
         coalesce(max(billing_order) filter (where kind = 'crew'), 0)
    into v_cast_n, v_crew_n
    from credits where production_id = v_prod;

  for v_item in select * from jsonb_array_elements(coalesce(b -> 'credits', '[]')) loop
    v_key := v_item ->> 'person_key';
    if not v_people ? v_key then
      if not v_entries ? v_key then raise exception 'A credit is missing its person'; end if;
      if v_entries -> v_key ? 'id' then
        select id into v_person from people where id = (v_entries -> v_key ->> 'id')::uuid;
        if v_person is null then raise exception 'A selected person no longer exists'; end if;
      else
        if coalesce((v_entries -> v_key -> 'new' ->> 'adult_confirmed')::boolean, false) is not true then
          raise exception 'Every new person must be confirmed as 18 or older';
        end if;
        if nullif(trim(v_entries -> v_key -> 'new' ->> 'display_name'), '') is null then
          raise exception 'A new person needs a name';
        end if;
        insert into people (slug, display_name, sort_name, adult_attested_at, adult_attested_by, created_by)
        values (unique_slug('people', v_entries -> v_key -> 'new' ->> 'display_name'),
                trim(v_entries -> v_key -> 'new' ->> 'display_name'),
                sort_name_for(v_entries -> v_key -> 'new' ->> 'display_name'),
                v_prop.created_at, v_user, v_user)
        returning id into v_person;
      end if;
      v_people := v_people || jsonb_build_object(v_key, v_person);
    end if;
    v_person := (v_people ->> v_key)::uuid;

    v_role := nullif(trim(v_item ->> 'role'), '');
    if v_role is null then raise exception 'Every credit needs a role'; end if;

    if v_item ->> 'kind' = 'cast' then
      v_cast_n := v_cast_n + 1;
      select id into v_char from show_characters
       where show_id = v_show and lower(name) = lower(v_role);
      if v_char is null then
        insert into show_characters (show_id, name, sort_order)
        values (v_show, v_role,
                (select coalesce(max(sort_order), 0) + 1 from show_characters where show_id = v_show))
        returning id into v_char;
      end if;
      insert into credits (production_id, person_id, kind, character_id, billing_order, created_by)
      values (v_prod, v_person, 'cast', v_char, v_cast_n, v_user);
    elsif v_item ->> 'kind' = 'crew' then
      v_crew_n := v_crew_n + 1;
      insert into credits (production_id, person_id, kind, role_name, billing_order, created_by)
      values (v_prod, v_person, 'crew', v_role, v_crew_n, v_user);
    else
      raise exception 'Unknown credit type';
    end if;
  end loop;

  -- Keep left_out only if something was actually left out
  v_left := case
    when p_left_out is null then null
    when jsonb_typeof(p_left_out -> 'location') = 'object'
      or jsonb_array_length(coalesce(p_left_out -> 'performances', '[]')) > 0
      or jsonb_array_length(coalesce(p_left_out -> 'credits', '[]')) > 0
    then p_left_out
  end;

  -- Mark approved; edit_proposals_points awards the contributor's points
  perform set_config('app.applying_submission', 'on', true);
  update edit_proposals
     set status = 'approved', entity_id = v_prod,
         approved_changes = b, left_out = v_left,
         review_note = nullif(trim(p_note), ''),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_proposal_id;
  perform set_config('app.applying_submission', '', true);

  return v_prod;
end $$;
