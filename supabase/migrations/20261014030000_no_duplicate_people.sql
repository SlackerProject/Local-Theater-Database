-- =====================================================================
-- Local Theater Database: migration 0024
-- No duplicate people
--
-- A new person named in a submission only gets a page when the
-- submission is approved, so two pending submissions could each create
-- "Jane Doe". From now on:
--   * person_name_key(): a name compared without capitals, spacing or
--     punctuation ("Jane  Doe." = "jane doe").
--   * A trigger refuses to create a person whose name matches someone
--     already on the site, unless the moderator confirmed they're a
--     different person (app.distinct_people, set for one transaction).
--   * find_people_by_names(): who's already on the site with these names,
--     for the moderators' review screens.
--   * approve_submission_checked(): approve_submission() that first allows
--     the new people the moderator marked "different person".
--   * apply_correction(): a new person who matches someone already on the
--     site is linked to them, unless marked different
--     ("distinct": true on the line, or review key distinct:credit:add:<n>).
-- Runs after 0023 (20261014020000_show_roles.sql).
-- =====================================================================

create or replace function person_name_key(p_name text) returns text
language sql immutable as $$
  select lower(trim(regexp_replace(coalesce(p_name, ''), '[^[:alnum:]]+', ' ', 'g')));
$$;

create index if not exists people_name_key_idx on people (person_name_key(display_name));

-- Allowed same-name people for this transaction, as keys separated by |
create or replace function allow_distinct_person(p_name text) returns void
language sql as $$
  select set_config('app.distinct_people',
                    coalesce(current_setting('app.distinct_people', true), '') || '|' || person_name_key(p_name) || '|', true);
$$;

create or replace function guard_duplicate_person() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from people where person_name_key(display_name) = person_name_key(new.display_name))
     and position('|' || person_name_key(new.display_name) || '|' in coalesce(current_setting('app.distinct_people', true), '')) = 0 then
    raise exception '% is already on the site. Use their existing page, or confirm they''re a different person.', trim(new.display_name);
  end if;
  return new;
end $$;

drop trigger if exists people_no_duplicates on people;
create trigger people_no_duplicates before insert on people
  for each row execute function guard_duplicate_person();

-- People already on the site with these names, with a line to tell them apart
create or replace function find_people_by_names(p_names text[])
returns table (name_key text, id uuid, display_name text, slug text, detail text)
language sql stable security definer set search_path = public as $$
  select person_name_key(pe.display_name), pe.id, pe.display_name, pe.slug,
         (select coalesce(sc.name, c.role_name) || ', ' || coalesce(p.title_override, s.title) || ' (' || p.year || ')'
            from credits c
            join productions p on p.id = c.production_id
            join shows s on s.id = p.show_id
            left join show_characters sc on sc.id = c.character_id
           where c.person_id = pe.id
           order by p.year desc limit 1)
  from people pe
  where person_name_key(pe.display_name) = any (select person_name_key(n) from unnest(p_names) n)
  order by pe.created_at;
$$;

-- Approve a submission; people marked {"new": {..., "distinct": true}} may
-- share a name with someone already on the site
create or replace function approve_submission_checked(
  p_proposal_id uuid,
  p_bundle      jsonb default null,
  p_left_out    jsonb default null,
  p_note        text  default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  for v in select * from jsonb_array_elements(coalesce(p_bundle -> 'people', '[]')) loop
    if coalesce((v -> 'new' ->> 'distinct')::boolean, false) then
      perform allow_distinct_person(v -> 'new' ->> 'display_name');
    end if;
  end loop;
  return approve_submission(p_proposal_id, p_bundle, p_left_out, p_note);
end $$;

-- Apply a correction's accepted changes (as in show_roles; new people
-- matching someone on the site are linked to them unless marked different)
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

revoke execute on function apply_correction(uuid, text[]), allow_distinct_person(text), guard_duplicate_person()
  from public, anon, authenticated;
revoke execute on function approve_submission_checked(uuid, jsonb, jsonb, text), find_people_by_names(text[]) from public, anon;
grant execute on function approve_submission_checked(uuid, jsonb, jsonb, text), find_people_by_names(text[]) to authenticated;
