-- =====================================================================
-- Local Theater Database: migration 0023
-- Editing a show's roles before anyone is cast
--
-- A show's roles (show_characters) used to appear only once someone was
-- credited in them. Corrections can now change the list directly, from a
-- production's edit page or the show's:
--   changes.roles = { "add": ["Monty Navarro", ...],
--                     "rename": [{"id": "<character id>", "name": "..."}],
--                     "remove": ["<character id>", ...] }
-- Review keys: role:add:<n>, role:rename:<id>, role:remove:<id>.
-- The list belongs to the show, so every production of it shares it.
-- A role someone is credited in can't be removed (rename it instead).
-- Runs after 0022 (20261014010000_moderation_pending_count.sql).
-- =====================================================================

create or replace function correction_changes(p_changes jsonb) returns jsonb
language sql immutable as $$
  select case
    when p_changes ? 'fields' or p_changes ? 'credits' or p_changes ? 'performances' or p_changes ? 'roles' then p_changes
    else jsonb_build_object('fields', coalesce(p_changes, '{}'))
  end;
$$;

-- Apply a correction's accepted changes (as in half_point_corrections, plus roles)
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
  v_created jsonb := '{}';   -- lower(name) -> the person created for it
  v_key text;
  v_show uuid;
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
      if nullif(v ->> 'person_id', '') is not null then
        v_person := (v ->> 'person_id')::uuid;
      else
        v_key := lower(regexp_replace(trim(v ->> 'new_name'), '\s+', ' ', 'g'));
        if v_created ? v_key then
          v_person := (v_created ->> v_key)::uuid;
        else
          insert into people (slug, display_name, sort_name, adult_attested_at, adult_attested_by, created_by)
          values (unique_slug('people', trim(v ->> 'new_name')), trim(v ->> 'new_name'), sort_name_for(v ->> 'new_name'),
                  now(), v_prop.proposed_by, v_prop.proposed_by)
          returning id into v_person;
          v_created := v_created || jsonb_build_object(v_key, v_person);
        end if;
      end if;
      insert into credits (production_id, person_id, kind, character_id, role_name, billing_order, created_by)
      values (v_prop.entity_id, v_person, (v ->> 'kind')::credit_kind,
              case when v ->> 'kind' = 'cast' then character_for(v_prop.entity_id, v_role) end,
              case when v ->> 'kind' = 'crew' then v_role end,
              (select coalesce(max(billing_order), 0) + 1 from credits
                where production_id = v_prop.entity_id and kind = (v ->> 'kind')::credit_kind),
              v_prop.proposed_by)
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
             is_cancelled = coalesce((v ->> 'cancelled')::boolean, false)
       where id = (v ->> 'id')::uuid and production_id = v_prop.entity_id;
      v_n := v_n + 1;
    end if;
  end loop;

  for v, i in select value, ordinality - 1 from jsonb_array_elements(coalesce(c -> 'performances' -> 'add', '[]')) with ordinality loop
    if p_accept is null or 'perf:add:' || i = any(p_accept) then
      insert into performances (production_id, starts_at, label)
      values (v_prop.entity_id,
              ((v ->> 'date')::date + coalesce(nullif(v ->> 'time', ''), '19:30')::time) at time zone 'America/New_York',
              nullif(trim(v ->> 'label'), ''))
      on conflict (production_id, starts_at) do nothing;
      v_n := v_n + 1;
    end if;
  end loop;

  return v_n;
end $$;
revoke execute on function apply_correction(uuid, text[]) from public, anon, authenticated;

-- Returns 'published' (moderators) or 'pending' (as in corrections_and_member_tools, plus roles)
create or replace function submit_correction(p_table text, p_id uuid, p_changes jsonb, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare
  c jsonb := correction_changes(coalesce(p_changes, '{}'));
  k text;
  v jsonb;
  v_exists boolean;
  v_count int;
  v_id uuid;
  v_show uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_table not in ('productions', 'people', 'organizations', 'shows', 'locations') then
    raise exception 'That page can''t be corrected here';
  end if;
  execute format('select exists (select 1 from %I where id = $1)', p_table) into v_exists using p_id;
  if not v_exists then raise exception 'That page no longer exists'; end if;

  for k in select jsonb_object_keys(coalesce(c -> 'fields', '{}')) loop
    if not k = any(correction_fields(p_table)) then raise exception 'Unknown field: %', k; end if;
  end loop;
  if p_table = 'people' and (c -> 'fields') ? 'bio' and exists (
    select 1 from people where id = p_id and verified_owner_id is not null and verified_owner_id <> auth.uid()
  ) then
    raise exception 'This person manages their own bio';
  end if;
  if p_table <> 'productions' and (c ? 'credits' or c ? 'performances') then
    raise exception 'Cast, crew and dates belong to productions';
  end if;
  if p_table not in ('productions', 'shows') and c ? 'roles' then
    raise exception 'Roles belong to shows';
  end if;
  for v in select * from jsonb_array_elements(coalesce(c -> 'credits' -> 'add', '[]')) loop
    if v ->> 'kind' not in ('cast', 'crew') or nullif(trim(v ->> 'role'), '') is null then
      raise exception 'Each person added needs a role';
    end if;
    if nullif(v ->> 'person_id', '') is null then
      if nullif(trim(v ->> 'new_name'), '') is null then raise exception 'Each person added needs a name'; end if;
      if coalesce((v ->> 'adult_confirmed')::boolean, false) is not true then
        raise exception 'Confirm that everyone new is 18 or older';
      end if;
    end if;
  end loop;
  for v in select * from jsonb_array_elements(coalesce(c -> 'performances' -> 'add', '[]') || coalesce(c -> 'performances' -> 'update', '[]')) loop
    if coalesce(v ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Each performance needs a date'; end if;
  end loop;

  -- Roles: names of 1 to 100 characters; renamed and removed roles must be this show's
  if c ? 'roles' then
    v_show := case when p_table = 'shows' then p_id else (select show_id from productions where id = p_id) end;
    for v in select * from jsonb_array_elements(coalesce(c -> 'roles' -> 'add', '[]')) loop
      if length(trim(coalesce(v #>> '{}', ''))) not between 1 and 100 then raise exception 'Each role needs a name (up to 100 characters)'; end if;
    end loop;
    for v in select * from jsonb_array_elements(coalesce(c -> 'roles' -> 'rename', '[]')) loop
      if length(trim(coalesce(v ->> 'name', ''))) not between 1 and 100 then raise exception 'Each role needs a name (up to 100 characters)'; end if;
      if not exists (select 1 from show_characters where id::text = v ->> 'id' and show_id = v_show) then
        raise exception 'That role isn''t part of this show';
      end if;
    end loop;
    for v in select * from jsonb_array_elements(coalesce(c -> 'roles' -> 'remove', '[]')) loop
      if not exists (select 1 from show_characters where id::text = v #>> '{}' and show_id = v_show) then
        raise exception 'That role isn''t part of this show';
      end if;
    end loop;
  end if;

  select coalesce((select count(*) from jsonb_object_keys(coalesce(c -> 'fields', '{}'))), 0)
       + coalesce(jsonb_array_length(c -> 'credits' -> 'add'), 0) + coalesce(jsonb_array_length(c -> 'credits' -> 'remove'), 0)
       + coalesce(jsonb_array_length(c -> 'credits' -> 'update'), 0) + coalesce(jsonb_array_length(c -> 'performances' -> 'add'), 0)
       + coalesce(jsonb_array_length(c -> 'performances' -> 'remove'), 0) + coalesce(jsonb_array_length(c -> 'performances' -> 'update'), 0)
       + coalesce(jsonb_array_length(c -> 'roles' -> 'add'), 0) + coalesce(jsonb_array_length(c -> 'roles' -> 'rename'), 0)
       + coalesce(jsonb_array_length(c -> 'roles' -> 'remove'), 0)
    into v_count;
  if v_count = 0 and nullif(trim(p_note), '') is null then raise exception 'Nothing has changed yet'; end if;

  insert into edit_proposals (entity_table, entity_id, changes, note, proposed_by)
  values (p_table, p_id, c, nullif(trim(left(p_note, 2000)), ''), auth.uid())
  returning id into v_id;

  if has_role('moderator') and v_count > 0 then
    perform apply_correction(v_id, null);
    update edit_proposals set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = v_id;
    return 'published';
  end if;
  return 'pending';
end $$;
