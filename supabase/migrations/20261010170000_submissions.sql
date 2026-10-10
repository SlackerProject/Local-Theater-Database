-- =====================================================================
-- Local Theater Database: migration 0003
-- Accounts and bundled production submissions
--
-- Adds:
--   * handle_new_user()      creates the profiles row at sign-up, from the
--                            username, display name and 18+ confirmation
--                            passed as sign-up metadata
--   * slugify(), unique_slug()   URL slugs for new records
--   * lookup()               type-ahead search for the submission form
--   * submission_drafts      one saved draft per member
--   * edit_proposals         new entity_table 'production_submission':
--                            the whole "Add a production" form is stored
--                            as one pending proposal (changes = the bundle)
--   * approve_submission()   a moderator approves the bundle; every record
--                            is created in one transaction (all or nothing)
--                            and the existing award_points trigger fires
--   * reject_submission()
-- Runs after 0002_profile_claiming.sql.
-- =====================================================================

create extension if not exists unaccent;

-- ---------------------------------------------------------------------
-- Profiles are created by trigger when an auth user signs up.
-- age_confirmed_at is NOT NULL, so sign-up fails without the 18+ box.
-- ---------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into profiles (id, username, display_name, age_confirmed_at)
  values (
    new.id,
    v_meta ->> 'username',
    coalesce(nullif(trim(v_meta ->> 'display_name'), ''), v_meta ->> 'username'),
    case when (v_meta ->> 'age_confirmed') = 'true' then now() end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- Slugs: "Little Women" -> little-women; taken -> little-women-2
-- ---------------------------------------------------------------------
create or replace function slugify(p_text text) returns text
language sql stable set search_path = public as $$
  select coalesce(
    nullif(trim(both '-' from left(
      trim(both '-' from regexp_replace(lower(unaccent(coalesce(p_text, ''))), '[^a-z0-9]+', '-', 'g')),
      80)), ''),
    'untitled');
$$;

create or replace function unique_slug(p_table text, p_text text) returns text
language plpgsql stable set search_path = public as $$
declare
  v_base text := slugify(p_text);
  v_candidate text := v_base;
  v_n int := 1;
  v_taken boolean;
begin
  if p_table not in ('shows', 'organizations', 'locations', 'people', 'productions') then
    raise exception 'unique_slug: unsupported table %', p_table;
  end if;
  loop
    execute format('select exists (select 1 from %I where slug = $1)', p_table)
      into v_taken using v_candidate;
    exit when not v_taken;
    v_n := v_n + 1;
    v_candidate := v_base || '-' || v_n;
  end loop;
  return v_candidate;
end $$;

-- "Jane Q. Doe" -> "Doe, Jane Q."
create or replace function sort_name_for(p_name text) returns text
language sql immutable as $$
  select case
    when position(' ' in trim(p_name)) = 0 then trim(p_name)
    else regexp_replace(trim(p_name), '^(.*)\s+(\S+)$', '\2, \1')
  end;
$$;

-- ---------------------------------------------------------------------
-- Type-ahead search for the submission form.
-- p_kind: 'shows' | 'organizations' | 'locations' | 'people'
-- detail is a short description shown under the name.
-- ---------------------------------------------------------------------
create or replace function lookup(p_kind text, p_query text, max_results int default 6)
returns table (id uuid, slug text, label text, detail text)
language plpgsql stable set search_path = public as $$
declare
  q text := trim(coalesce(p_query, ''));
  -- Looser than pg_trgm's default 0.6, so typos like "Michal" still find "Michael"
  min_sim constant real := 0.4;
begin
  if length(q) < 2 then
    return;
  end if;

  if p_kind = 'shows' then
    return query
      select s.id, s.slug, s.title,
             concat_ws(' · ', s.subtitle, initcap(s.type::text))
      from shows s
      where s.title ilike '%' || q || '%' or word_similarity(q, s.title) >= min_sim
      order by lower(s.title) = lower(q) desc, s.title ilike q || '%' desc,
               word_similarity(q, s.title) desc, s.title
      limit max_results;

  elsif p_kind = 'organizations' then
    return query
      select o.id, o.slug, o.name, concat_ws(', ', o.town, o.state)
      from organizations o
      where o.name ilike '%' || q || '%' or word_similarity(q, o.name) >= min_sim
         or o.short_name ilike '%' || q || '%'
      order by lower(o.name) = lower(q) desc, o.name ilike q || '%' desc,
               word_similarity(q, o.name) desc, o.name
      limit max_results;

  elsif p_kind = 'locations' then
    return query
      select l.id, l.slug, l.name,
             concat_ws(', ', l.street_address, l.town, l.state)
      from locations l
      where l.name ilike '%' || q || '%' or word_similarity(q, l.name) >= min_sim
      order by lower(l.name) = lower(q) desc, l.name ilike q || '%' desc,
               word_similarity(q, l.name) desc, l.name
      limit max_results;

  elsif p_kind = 'people' then
    return query
      select pe.id, pe.slug, pe.display_name,
             case when cr.n = 0 then 'No credits yet'
                  else cr.n || case when cr.n = 1 then ' credit' else ' credits' end
                       || coalesce(', most recently at ' || cr.org, '')
             end
      from people pe
      cross join lateral (
        select count(*)::int as n,
               (select o.name
                  from credits c2
                  join productions p2 on p2.id = c2.production_id
                  join organizations o on o.id = p2.organization_id
                 where c2.person_id = pe.id
                 order by p2.year desc, p2.opening_date desc nulls last
                 limit 1) as org
        from credits c where c.person_id = pe.id
      ) cr
      where not pe.is_hidden
        and (pe.display_name ilike '%' || q || '%' or word_similarity(q, pe.display_name) >= min_sim)
      order by lower(pe.display_name) = lower(q) desc, pe.display_name ilike q || '%' desc,
               word_similarity(q, pe.display_name) desc, pe.display_name
      limit max_results;

  else
    raise exception 'lookup: unknown kind %', p_kind;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Drafts: one per member, private to them
-- ---------------------------------------------------------------------
create table submission_drafts (
  user_id     uuid primary key references profiles (id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
create trigger submission_drafts_updated_at before update on submission_drafts
  for each row execute function set_updated_at();

alter table submission_drafts enable row level security;
create policy "own draft" on submission_drafts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Bundled submissions live in edit_proposals
-- ---------------------------------------------------------------------
alter table edit_proposals drop constraint edit_proposals_entity_table_check;
alter table edit_proposals add constraint edit_proposals_entity_table_check
  check (entity_table in (
    'organizations', 'locations', 'shows', 'show_characters', 'people',
    'productions', 'performances', 'credits', 'award_entries',
    'production_submission'));

-- A bundle can only become 'approved' through approve_submission(), which
-- actually creates the records. Otherwise a direct status change would
-- award points for records that were never created.
create or replace function guard_submission_approval() returns trigger
language plpgsql as $$
begin
  if new.entity_table = 'production_submission'
     and new.status = 'approved' and old.status is distinct from 'approved'
     and coalesce(current_setting('app.applying_submission', true), '') <> 'on' then
    raise exception 'Approve production submissions with approve_submission()';
  end if;
  return new;
end $$;
create trigger edit_proposals_guard_submission before update on edit_proposals
  for each row execute function guard_submission_approval();

-- ---------------------------------------------------------------------
-- Approve: create everything in the bundle, all or nothing.
--
-- Bundle shape (edit_proposals.changes), version 1:
-- {
--   "version": 1,
--   "show":         {"id": uuid} | {"new": {"title", "type", "subtitle"?}},
--   "organization": {"id": uuid} | {"new": {"name", "town"?, "website_url"?}},
--   "location":     null | {"id": uuid} | {"new": {"name", "street_address"?, "town"?}},
--   "production":   {"year", "opening_date"?, "closing_date"?},
--   "performances": [{"date": "YYYY-MM-DD", "time": "HH:MM", "label"?}],
--   "people":       [{"key", "id": uuid} | {"key", "new": {"display_name", "adult_confirmed": true}}],
--   "credits":      [{"kind": "cast"|"crew", "role", "person_key"}]
-- }
-- Performance times are local to Massachusetts (America/New_York).
-- ---------------------------------------------------------------------
create or replace function approve_submission(p_proposal_id uuid)
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
  v_people  jsonb := '{}'::jsonb;   -- person key -> person id
  v_item    jsonb;
  v_person  uuid;
  v_char    uuid;
  v_role    text;
  v_order   int;
  v_cast_n  int := 0;
  v_crew_n  int := 0;
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

  b := v_prop.changes;
  v_user := v_prop.proposed_by;

  -- Show
  if b -> 'show' ? 'id' then
    select id, title into v_show, v_title from shows where id = (b -> 'show' ->> 'id')::uuid;
    if v_show is null then raise exception 'The selected show no longer exists'; end if;
  else
    v_title := nullif(trim(b -> 'show' -> 'new' ->> 'title'), '');
    if v_title is null then raise exception 'The show needs a title'; end if;
    insert into shows (slug, title, subtitle, type, created_by)
    values (unique_slug('shows', v_title), v_title,
            nullif(trim(b -> 'show' -> 'new' ->> 'subtitle'), ''),
            coalesce(nullif(b -> 'show' -> 'new' ->> 'type', ''), 'other')::show_type,
            v_user)
    returning id into v_show;
  end if;

  -- Company
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

  -- Location (optional)
  if jsonb_typeof(b -> 'location') = 'object' then
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
      insert into organization_locations (organization_id, location_id)
      values (v_org, v_loc) on conflict do nothing;
    end if;
  end if;

  -- Production
  v_year := (b -> 'production' ->> 'year')::smallint;
  if v_year is null then raise exception 'The production needs a year'; end if;

  insert into productions (slug, show_id, organization_id, location_id, year,
                           opening_date, closing_date, created_by)
  values (
    unique_slug('productions', v_title || ' ' || v_orgname || ' ' || v_year),
    v_show, v_org, v_loc, v_year,
    coalesce(nullif(b -> 'production' ->> 'opening_date', '')::date,
             (select min((p ->> 'date')::date) from jsonb_array_elements(coalesce(b -> 'performances', '[]')) p)),
    coalesce(nullif(b -> 'production' ->> 'closing_date', '')::date,
             (select max((p ->> 'date')::date) from jsonb_array_elements(coalesce(b -> 'performances', '[]')) p)),
    v_user)
  returning id into v_prod;

  -- Performances
  for v_item in select * from jsonb_array_elements(coalesce(b -> 'performances', '[]')) loop
    insert into performances (production_id, starts_at, label)
    values (v_prod,
            ((v_item ->> 'date')::date + coalesce(nullif(v_item ->> 'time', ''), '19:30')::time)
              at time zone 'America/New_York',
            nullif(trim(v_item ->> 'label'), ''))
    on conflict (production_id, starts_at) do nothing;
  end loop;

  -- People: reuse existing ones, create new ones (adults only)
  for v_item in select * from jsonb_array_elements(coalesce(b -> 'people', '[]')) loop
    if v_item ? 'id' then
      select id into v_person from people where id = (v_item ->> 'id')::uuid;
      if v_person is null then raise exception 'A selected person no longer exists'; end if;
    else
      if coalesce((v_item -> 'new' ->> 'adult_confirmed')::boolean, false) is not true then
        raise exception 'Every new person must be confirmed as 18 or older';
      end if;
      if nullif(trim(v_item -> 'new' ->> 'display_name'), '') is null then
        raise exception 'A new person needs a name';
      end if;
      insert into people (slug, display_name, sort_name, adult_attested_at, adult_attested_by, created_by)
      values (unique_slug('people', v_item -> 'new' ->> 'display_name'),
              trim(v_item -> 'new' ->> 'display_name'),
              sort_name_for(v_item -> 'new' ->> 'display_name'),
              v_prop.created_at, v_user, v_user)
      returning id into v_person;
    end if;
    v_people := v_people || jsonb_build_object(v_item ->> 'key', v_person);
  end loop;

  -- Credits. Cast roles become the show's canonical characters.
  for v_item in select * from jsonb_array_elements(coalesce(b -> 'credits', '[]')) loop
    v_person := (v_people ->> (v_item ->> 'person_key'))::uuid;
    if v_person is null then raise exception 'A credit is missing its person'; end if;
    v_role := nullif(trim(v_item ->> 'role'), '');
    if v_role is null then raise exception 'Every credit needs a role'; end if;

    if v_item ->> 'kind' = 'cast' then
      v_cast_n := v_cast_n + 1;
      v_order := v_cast_n;
      select id into v_char from show_characters
       where show_id = v_show and lower(name) = lower(v_role);
      if v_char is null then
        insert into show_characters (show_id, name, sort_order)
        values (v_show, v_role,
                (select coalesce(max(sort_order), 0) + 1 from show_characters where show_id = v_show))
        returning id into v_char;
      end if;
      insert into credits (production_id, person_id, kind, character_id, billing_order, created_by)
      values (v_prod, v_person, 'cast', v_char, v_order, v_user);
    elsif v_item ->> 'kind' = 'crew' then
      v_crew_n := v_crew_n + 1;
      insert into credits (production_id, person_id, kind, role_name, billing_order, created_by)
      values (v_prod, v_person, 'crew', v_role, v_crew_n, v_user);
    else
      raise exception 'Unknown credit type';
    end if;
  end loop;

  -- Mark approved; edit_proposals_points awards the contributor's points
  perform set_config('app.applying_submission', 'on', true);
  update edit_proposals
     set status = 'approved', entity_id = v_prod,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_proposal_id;
  perform set_config('app.applying_submission', '', true);

  return v_prod;
end $$;

create or replace function reject_submission(p_proposal_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('moderator') then
    raise exception 'Only moderators can reject submissions';
  end if;
  update edit_proposals
     set status = 'rejected', review_note = nullif(trim(p_note), ''),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_proposal_id
     and entity_table = 'production_submission'
     and status = 'pending';
  if not found then
    raise exception 'Submission not found or already reviewed';
  end if;
end $$;

-- Only signed-in members call the review functions; the helpers are internal.
revoke execute on function
  approve_submission(uuid), reject_submission(uuid, text),
  unique_slug(text, text), handle_new_user()
from public, anon;
grant execute on function approve_submission(uuid), reject_submission(uuid, text) to authenticated;
