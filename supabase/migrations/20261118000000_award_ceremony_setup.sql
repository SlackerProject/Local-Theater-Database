-- =====================================================================
-- Moderators set up awards themselves:
--   * Ceremonies: a name (DASH Awards) and a season (2025–2026), kept
--     separate, added and removed by moderators.
--   * Each ceremony has its own list of awards (categories), added and
--     removed per ceremony; a new season can start from the last one's list.
--   * Awards are grouped by who is nominated:
--       performer  an actor, with the production (names optional)
--       youth      a young performer: the production only, never a name
--       creative   a creative team member (director, designer, stage manager…)
--       production the production itself (incl. whole-cast ensemble awards)
--       company    a theater company
--       person     a person, not for one show (e.g. Lifetime Achievement)
-- =====================================================================

-- New kinds, mapped from the old ones
alter table award_categories drop constraint award_categories_kind_check;
update award_categories set kind = 'production' where kind = 'ensemble';
update award_categories set kind = 'person' where kind = 'honor';
update award_categories set kind = 'performer' where kind = 'person' and section = 'Performance';
update award_categories set kind = 'creative'
 where kind = 'person' and section in ('Direction, Music & Movement', 'Design', 'Stage Management');
-- Consultant Choice awards, one by one
update award_categories set kind = 'performer' where name in ('Excellence in Dialect Work', 'Badass Combat Award');
update award_categories set kind = 'creative'
 where name in ('Excellence in Projection Design', 'Excellence in Specialty Makeup', 'Creature Design', 'Original Instrumental & Vocal Music',
                'Achievement in Mechanical Magic: Greased Lightning', 'Excellence in Fight Direction', 'Distinguished Achievement in Inclusive Casting');
update award_categories set kind = 'production' where name in ('A Documentary Play With Music', 'Creative Community Collaboration Award');
update award_categories set kind = 'person' where name in ('Lifetime Achievement Award', 'Diversity, Equity & Inclusion Impact Award');
alter table award_categories alter column kind set default 'performer';
alter table award_categories add constraint award_categories_kind_check
  check (kind in ('performer', 'youth', 'creative', 'production', 'company', 'person'));

-- Which awards each ceremony gives
create table award_ceremony_categories (
  ceremony_id  uuid not null references award_ceremonies (id) on delete cascade,
  category_id  uuid not null references award_categories (id) on delete cascade,
  sort_order   integer not null default 0,
  primary key (ceremony_id, category_id)
);
alter table award_ceremony_categories enable row level security;
create policy "award_ceremony_categories readable by all" on award_ceremony_categories for select using (true);
create policy "award_ceremony_categories writable by moderators" on award_ceremony_categories for all to authenticated
  using (has_role('moderator')) with check (has_role('moderator'));

-- This season gives every award loaded so far
insert into award_ceremony_categories (ceremony_id, category_id, sort_order)
select c.id, k.id, k.sort_order
  from award_ceremonies c join award_categories k on k.award_body_id = c.award_body_id
on conflict do nothing;

-- Seasons written in full, like the example: 2025–2026
update award_ceremonies set season = '2025–2026' where season = '2025–26';

-- The rules, checked on every save (replaces the step 2 version)
create or replace function award_entry_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cer  award_ceremonies;
  v_cat  award_categories;
  v_cr   credits;
begin
  select * into v_cer from award_ceremonies where id = new.ceremony_id;
  select * into v_cat from award_categories where id = new.category_id;
  if not exists (select 1 from award_ceremony_categories where ceremony_id = new.ceremony_id and category_id = new.category_id) then
    raise exception 'That award isn’t part of this ceremony';
  end if;
  new.award_year := v_cer.year;

  if new.credit_id is not null then
    select * into v_cr from credits where id = new.credit_id;
    if not found or v_cr.production_id is distinct from new.production_id then
      raise exception 'That person isn’t credited in this production';
    end if;
    if v_cr.is_young_performer then new.person_id := null; else new.person_id := v_cr.person_id; end if;
  end if;

  if v_cat.kind = 'company' then
    new.production_id := null; new.person_id := null; new.credit_id := null;
    if new.organization_id is null then raise exception 'Choose the company'; end if;
  elsif v_cat.kind = 'person' then
    new.production_id := null; new.credit_id := null; new.organization_id := null;
    if new.person_id is null then raise exception 'Choose the person'; end if;
  else
    if new.production_id is null then raise exception 'Choose the production'; end if;
    new.organization_id := null;   -- the company comes from the production
    if v_cat.kind in ('production', 'youth') then
      new.person_id := null;       -- no names: the production itself, or a young performer
      if v_cat.kind = 'production' then new.credit_id := null; end if;
    end if;
  end if;
  return new;
end $$;

-- "2025–2026" -> 2026 (the year it's held, for sorting); "2026" -> 2026
create or replace function season_year(p_season text) returns smallint
language sql immutable as $$
  select (regexp_match(p_season, '(\d{4})\D*$'))[1]::smallint
$$;

-- Add a ceremony: a name and a season. It can start with the awards of the
-- latest earlier ceremony with the same name.
create or replace function create_award_ceremony(p_name text, p_season text, p_source_url text default null, p_copy boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_name   text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_season text := regexp_replace(trim(coalesce(p_season, '')), '\s*[-–—/]\s*', '–', 'g');
  v_body   uuid;
  v_prev   uuid;
  v_slug   text;
  v_base   text;
  v_n      int := 1;
  v_id     uuid;
begin
  if not has_role('moderator') then raise exception 'Only moderators can add ceremonies'; end if;
  if v_name = '' then raise exception 'Enter the ceremony’s name, like DASH Awards'; end if;
  if v_season !~ '^\d{4}(–\d{4})?$' then raise exception 'Enter the season like 2025–2026, or a single year like 2026'; end if;
  if nullif(trim(p_source_url), '') is not null and trim(p_source_url) !~ '^https?://\S+\.\S+' then
    raise exception 'The source link should be a web address';
  end if;
  if exists (select 1 from award_ceremonies where lower(name) = lower(v_name) and season = v_season) then
    raise exception '% % already exists', v_name, v_season;
  end if;

  -- Same name as an earlier ceremony: same award group, and its awards to start from
  select id, award_body_id into v_prev, v_body from award_ceremonies where lower(name) = lower(v_name) order by year desc limit 1;
  if v_body is null then
    v_base := slugify(v_name);
    v_slug := v_base;
    while exists (select 1 from award_bodies where slug = v_slug) loop v_n := v_n + 1; v_slug := v_base || '-' || v_n; end loop;
    insert into award_bodies (slug, name) values (v_slug, v_name) returning id into v_body;
  end if;

  v_base := slugify(v_name || ' ' || v_season);
  v_slug := v_base; v_n := 1;
  while exists (select 1 from award_ceremonies where slug = v_slug) loop v_n := v_n + 1; v_slug := v_base || '-' || v_n; end loop;

  insert into award_ceremonies (award_body_id, slug, name, season, year, source_url)
  values (v_body, v_slug, v_name, v_season, season_year(v_season), nullif(trim(p_source_url), ''))
  returning id into v_id;

  if p_copy and v_prev is not null then
    insert into award_ceremony_categories (ceremony_id, category_id, sort_order)
    select v_id, category_id, sort_order from award_ceremony_categories where ceremony_id = v_prev;
  end if;
  return v_id;
end $$;

-- Remove a ceremony and every award entered for it
create or replace function delete_award_ceremony(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('moderator') then raise exception 'Only moderators can remove ceremonies'; end if;
  delete from award_ceremonies where id = p_id;
  if not found then raise exception 'That ceremony no longer exists'; end if;
end $$;

-- Add an award to a ceremony, by name and who is nominated
create or replace function add_ceremony_award(p_ceremony uuid, p_name text, p_kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_cer  award_ceremonies;
  v_cat  award_categories;
begin
  if not has_role('moderator') then raise exception 'Only moderators can add awards'; end if;
  select * into v_cer from award_ceremonies where id = p_ceremony;
  if not found then raise exception 'That ceremony no longer exists'; end if;
  if v_name = '' then raise exception 'Enter the award’s name'; end if;
  if p_kind not in ('performer', 'youth', 'creative', 'production', 'company', 'person') then raise exception 'Choose who is nominated'; end if;

  select * into v_cat from award_categories where award_body_id = v_cer.award_body_id and lower(name) = lower(v_name);
  if found then
    if v_cat.kind <> p_kind then
      if exists (select 1 from award_entries where category_id = v_cat.id) then
        raise exception '“%” already has nominees saved under a different kind of nominee. Use a slightly different name.', v_cat.name;
      end if;
      update award_categories set kind = p_kind where id = v_cat.id;
    end if;
  else
    insert into award_categories (award_body_id, name, kind) values (v_cer.award_body_id, v_name, p_kind) returning * into v_cat;
  end if;

  insert into award_ceremony_categories (ceremony_id, category_id, sort_order)
  values (p_ceremony, v_cat.id, coalesce((select max(sort_order) + 10 from award_ceremony_categories where ceremony_id = p_ceremony), 10))
  on conflict do nothing;
  return v_cat.id;
end $$;

-- Remove an award from one ceremony, with its nominees for that ceremony
create or replace function remove_ceremony_award(p_ceremony uuid, p_category uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('moderator') then raise exception 'Only moderators can remove awards'; end if;
  delete from award_entries where ceremony_id = p_ceremony and category_id = p_category;
  delete from award_ceremony_categories where ceremony_id = p_ceremony and category_id = p_category;
end $$;

revoke execute on function create_award_ceremony(text, text, text, boolean), delete_award_ceremony(uuid),
  add_ceremony_award(uuid, text, text), remove_ceremony_award(uuid, uuid) from public, anon;
grant execute on function create_award_ceremony(text, text, text, boolean), delete_award_ceremony(uuid),
  add_ceremony_award(uuid, text, text), remove_ceremony_award(uuid, uuid) to authenticated;

-- apply_award: the ceremony's own list, no ad-hoc categories any more
create or replace function apply_award(p_proposal_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c jsonb;
  v_by uuid;
  v_cer award_ceremonies;
begin
  select changes, proposed_by into c, v_by from edit_proposals where id = p_proposal_id;
  select * into v_cer from award_ceremonies where id = (c ->> 'ceremony_id')::uuid;
  if not found then raise exception 'Choose the ceremony'; end if;
  insert into award_entries (ceremony_id, category_id, award_year, production_id, person_id, credit_id, organization_id,
                             result, source_url, created_by)
  values (v_cer.id, (c ->> 'category_id')::uuid, v_cer.year,
          nullif(c ->> 'production_id', '')::uuid, nullif(c ->> 'person_id', '')::uuid, nullif(c ->> 'credit_id', '')::uuid,
          nullif(c ->> 'organization_id', '')::uuid,
          (c ->> 'result')::award_result, trim(c ->> 'source_url'), v_by)
  on conflict do nothing;
end $$;
