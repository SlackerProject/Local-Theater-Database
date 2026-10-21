-- =====================================================================
-- Local Theater Database: migration 0038
-- A venue for each performance (for touring shows and the like)
--
--   Performances already had location_id (empty = the production's
--   venue). Submissions and corrections can now set it: each performance
--   may name a venue already listed on the site ("location_id"); anything
--   else is ignored. approve_submission() and apply_correction() are as
--   in 0030, plus that.
-- Runs after 0037 (20261021000000_map_days.sql).
-- =====================================================================

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

  -- Poster uploaded with the submission (migration 0007)
  if jsonb_typeof(b -> 'poster') = 'object' then
    perform attach_submission_poster(v_user, v_prop.created_at, b -> 'poster', v_prod);
  end if;

  -- Performances (local Massachusetts time)
  for v_item in select * from jsonb_array_elements(coalesce(b -> 'performances', '[]')) loop
    insert into performances (production_id, starts_at, label, location_id)
    values (v_prod,
            ((v_item ->> 'date')::date + coalesce(nullif(v_item ->> 'time', ''), '19:30')::time)
              at time zone 'America/New_York',
            nullif(trim(v_item ->> 'label'), ''),
            (select l.id from locations l where l.id::text = nullif(v_item ->> 'location_id', '')))
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
    -- A young performer: the role only, never a person
    if coalesce((v_item ->> 'young')::boolean, false) then
      if v_item ->> 'kind' <> 'cast' then raise exception 'Only cast members can be young performers'; end if;
      v_role := nullif(trim(v_item ->> 'role'), '');
      if v_role is null then raise exception 'Every credit needs a role'; end if;
      v_cast_n := v_cast_n + 1;
      select id into v_char from show_characters where show_id = v_show and lower(name) = lower(v_role);
      if v_char is null then
        insert into show_characters (show_id, name, sort_order)
        values (v_show, v_role, (select coalesce(max(sort_order), 0) + 1 from show_characters where show_id = v_show))
        returning id into v_char;
      end if;
      insert into credits (production_id, person_id, kind, character_id, billing_order, is_young_performer, is_understudy, created_by)
      values (v_prod, null, 'cast', v_char, v_cast_n, true, coalesce((v_item ->> 'understudy')::boolean, false), v_user);
      continue;
    end if;

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
      -- Understudies are cast credits for the role they cover; the same
      -- person in the same role only once
      continue when exists (
        select 1 from credits
         where production_id = v_prod and person_id = v_person and kind = 'cast' and character_id = v_char
           and is_understudy = coalesce((v_item ->> 'understudy')::boolean, false));
      insert into credits (production_id, person_id, kind, character_id, billing_order, is_understudy, created_by)
      values (v_prod, v_person, 'cast', v_char, v_cast_n, coalesce((v_item ->> 'understudy')::boolean, false), v_user);
    elsif v_item ->> 'kind' = 'crew' then
      v_crew_n := v_crew_n + 1;
      continue when exists (
        select 1 from credits
         where production_id = v_prod and person_id = v_person and kind = 'crew' and lower(role_name) = lower(v_role));
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
      or jsonb_typeof(p_left_out -> 'poster') = 'object'
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

create or replace function apply_correction(p_proposal_id uuid, p_accept text[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_prop edit_proposals;
  c jsonb;
  v_set text;
  v_n int := 0;
  v jsonb;
  i bigint;
  v_credit credits;
  v_person uuid;
  v_new uuid;
  v_role text;
  v_created jsonb := '{}';   -- name key -> the person created for it
  v_key text;
  v_show uuid;
  v_distinct boolean;
  v_char uuid;
  v_us boolean;
begin
  select * into v_prop from edit_proposals where id = p_proposal_id;
  c := correction_changes(v_prop.changes);

  select string_agg(format('%I = r.%I', k, k), ', '), count(*)
    into v_set, i
    from jsonb_object_keys(coalesce(c -> 'fields', '{}')) k
   where k = any(correction_fields(v_prop.entity_table))
     and (p_accept is null or 'field:' || k = any(p_accept));
  if v_set is not null then
    execute format('update %I t set %s from jsonb_populate_record(null::%I, $1) r where t.id = $2',
                   v_prop.entity_table, v_set, v_prop.entity_table)
      using c -> 'fields', v_prop.entity_id;
    v_n := v_n + i;
    if v_prop.entity_table = 'people' and (c -> 'fields') ? 'display_name'
       and (p_accept is null or 'field:display_name' = any(p_accept)) then
      update people set sort_name = sort_name_for(display_name) where id = v_prop.entity_id;
    end if;
  end if;

  -- Roles: the show's list, from its own page or one of its productions
  if c ? 'roles' and v_prop.entity_table in ('shows', 'productions') then
    v_show := case when v_prop.entity_table = 'shows' then v_prop.entity_id
                   else (select show_id from productions where id = v_prop.entity_id) end;

    for v in select * from jsonb_array_elements(coalesce(c -> 'roles' -> 'remove', '[]')) loop
      if p_accept is null or 'role:remove:' || (v #>> '{}') = any(p_accept) then
        delete from show_characters sc
         where sc.id = (v #>> '{}')::uuid and sc.show_id = v_show
           and not exists (select 1 from credits cr where cr.character_id = sc.id);
        if found then v_n := v_n + 1; end if;
      end if;
    end loop;

    for v in select * from jsonb_array_elements(coalesce(c -> 'roles' -> 'rename', '[]')) loop
      if p_accept is null or 'role:rename:' || (v ->> 'id') = any(p_accept) then
        v_role := nullif(regexp_replace(trim(v ->> 'name'), '\s+', ' ', 'g'), '');
        if v_role is not null and not exists (
          select 1 from show_characters where show_id = v_show and lower(name) = lower(v_role) and id <> (v ->> 'id')::uuid
        ) then
          update show_characters set name = v_role where id = (v ->> 'id')::uuid and show_id = v_show;
          if found then v_n := v_n + 1; end if;
        end if;
      end if;
    end loop;

    for v, i in select value, ordinality - 1 from jsonb_array_elements(coalesce(c -> 'roles' -> 'add', '[]')) with ordinality loop
      if p_accept is null or 'role:add:' || i = any(p_accept) then
        v_role := nullif(regexp_replace(trim(v #>> '{}'), '\s+', ' ', 'g'), '');
        if v_role is not null and not exists (select 1 from show_characters where show_id = v_show and lower(name) = lower(v_role)) then
          insert into show_characters (show_id, name, sort_order)
          values (v_show, v_role, (select coalesce(max(sort_order), 0) + 1 from show_characters where show_id = v_show));
          v_n := v_n + 1;
        end if;
      end if;
    end loop;
  end if;

  if v_prop.entity_table <> 'productions' then return v_n; end if;

  for v in select * from jsonb_array_elements(coalesce(c -> 'credits' -> 'remove', '[]')) loop
    if p_accept is null or 'credit:remove:' || (v #>> '{}') = any(p_accept) then
      delete from credits where id = (v #>> '{}')::uuid and production_id = v_prop.entity_id;
      v_n := v_n + 1;
    end if;
  end loop;

  for v in select * from jsonb_array_elements(coalesce(c -> 'credits' -> 'update', '[]')) loop
    if p_accept is null or 'credit:update:' || (v ->> 'id') = any(p_accept) then
      select * into v_credit from credits where id = (v ->> 'id')::uuid and production_id = v_prop.entity_id;
      v_role := nullif(trim(v ->> 'role'), '');
      if found and v_role is not null then
        if v_credit.kind = 'cast' then
          update credits set character_id = character_for(v_prop.entity_id, v_role), role_name = null where id = v_credit.id;
        else
          update credits set role_name = v_role where id = v_credit.id;
        end if;
        v_n := v_n + 1;
      end if;
    end if;
  end loop;

  for v, i in select value, ordinality - 1 from jsonb_array_elements(coalesce(c -> 'credits' -> 'add', '[]')) with ordinality loop
    if p_accept is null or 'credit:add:' || i = any(p_accept) then
      v_role := nullif(trim(v ->> 'role'), '');
      continue when v_role is null;
      -- A young performer: the role only, never a person
      if coalesce((v ->> 'young')::boolean, false) then
        continue when v ->> 'kind' <> 'cast';
        insert into credits (production_id, person_id, kind, character_id, billing_order, is_young_performer, is_understudy, created_by)
        values (v_prop.entity_id, null, 'cast', character_for(v_prop.entity_id, v_role),
                (select coalesce(max(billing_order), 0) + 1 from credits where production_id = v_prop.entity_id and kind = 'cast'),
                true, coalesce((v ->> 'understudy')::boolean, false), v_prop.proposed_by);
        v_n := v_n + 1;
        continue;
      end if;
      if nullif(v ->> 'person_id', '') is not null then
        v_person := (v ->> 'person_id')::uuid;
      else
        v_key := person_name_key(v ->> 'new_name');
        v_distinct := coalesce((v ->> 'distinct')::boolean, false)
                      or (p_accept is not null and 'distinct:credit:add:' || i = any(p_accept));
        if v_created ? v_key then
          v_person := (v_created ->> v_key)::uuid;
        else
          v_person := null;
          if not v_distinct then
            -- Already on the site (perhaps from a submission approved since): the same person
            select id into v_person from people where person_name_key(display_name) = v_key order by created_at limit 1;
          end if;
          if v_person is null then
            if v_distinct then perform allow_distinct_person(v ->> 'new_name'); end if;
            insert into people (slug, display_name, sort_name, adult_attested_at, adult_attested_by, created_by)
            values (unique_slug('people', trim(v ->> 'new_name')), regexp_replace(trim(v ->> 'new_name'), '\s+', ' ', 'g'),
                    sort_name_for(v ->> 'new_name'), now(), v_prop.proposed_by, v_prop.proposed_by)
            returning id into v_person;
          end if;
          v_created := v_created || jsonb_build_object(v_key, v_person);
        end if;
      end if;
      -- Understudies are cast credits for the role they cover
      v_us := v ->> 'kind' = 'cast' and coalesce((v ->> 'understudy')::boolean, false);
      v_char := case when v ->> 'kind' = 'cast' then character_for(v_prop.entity_id, v_role) end;
      -- The same person in the same role only once
      continue when exists (
        select 1 from credits
         where production_id = v_prop.entity_id and person_id = v_person and kind = (v ->> 'kind')::credit_kind
           and is_understudy = v_us
           and (character_id = v_char or (v_char is null and lower(role_name) = lower(v_role))));
      insert into credits (production_id, person_id, kind, character_id, role_name, billing_order, is_understudy, created_by)
      values (v_prop.entity_id, v_person, (v ->> 'kind')::credit_kind, v_char,
              case when v ->> 'kind' = 'crew' then v_role end,
              (select coalesce(max(billing_order), 0) + 1 from credits
                where production_id = v_prop.entity_id and kind = (v ->> 'kind')::credit_kind),
              v_us, v_prop.proposed_by)
      returning id into v_new;
      v_n := v_n + 1;
      insert into notifications (user_id, kind, production_id, person_id, credit_id)
      select f.user_id, 'cast_announcement', v_prop.entity_id, v_person, v_new
      from follows f join people pe on pe.id = f.person_id
      where f.person_id = v_person and not pe.is_hidden and f.user_id is distinct from pe.verified_owner_id
      on conflict do nothing;
    end if;
  end loop;

  for v in select * from jsonb_array_elements(coalesce(c -> 'performances' -> 'remove', '[]')) loop
    if p_accept is null or 'perf:remove:' || (v #>> '{}') = any(p_accept) then
      delete from performances where id = (v #>> '{}')::uuid and production_id = v_prop.entity_id;
      v_n := v_n + 1;
    end if;
  end loop;

  for v in select * from jsonb_array_elements(coalesce(c -> 'performances' -> 'update', '[]')) loop
    if p_accept is null or 'perf:update:' || (v ->> 'id') = any(p_accept) then
      update performances
         set starts_at = ((v ->> 'date')::date + coalesce(nullif(v ->> 'time', ''), '19:30')::time) at time zone 'America/New_York',
             label = nullif(trim(v ->> 'label'), ''),
             is_cancelled = coalesce((v ->> 'cancelled')::boolean, false),
             -- older corrections don't mention a venue: keep it
             location_id = case when v ? 'location_id' then (select l.id from locations l where l.id::text = nullif(v ->> 'location_id', '')) else location_id end
       where id = (v ->> 'id')::uuid and production_id = v_prop.entity_id;
      v_n := v_n + 1;
    end if;
  end loop;

  for v, i in select value, ordinality - 1 from jsonb_array_elements(coalesce(c -> 'performances' -> 'add', '[]')) with ordinality loop
    if p_accept is null or 'perf:add:' || i = any(p_accept) then
      insert into performances (production_id, starts_at, label, location_id)
      values (v_prop.entity_id,
              ((v ->> 'date')::date + coalesce(nullif(v ->> 'time', ''), '19:30')::time) at time zone 'America/New_York',
              nullif(trim(v ->> 'label'), ''),
              (select l.id from locations l where l.id::text = nullif(v ->> 'location_id', '')))
      on conflict (production_id, starts_at) do nothing;
      v_n := v_n + 1;
    end if;
  end loop;

  return v_n;
end $$;
