-- =====================================================================
-- Awards, step 2 of the company pages plan: store the DASH Awards.
--   * Award group (award_bodies): who gives it, e.g. EMACT
--   * Ceremony (award_ceremonies, new): one season's event, e.g. DASH Awards 2025–26
--   * Category: the award's name, with its section and what it honors
--   * Award entry: who got it, won or nominated, with a required source link
-- An entry points to a production (most awards), a person, or both; the
-- special honors (Lifetime Achievement, DEI Impact) have no production and
-- may name the company that presented them. The company of a production's
-- award comes from the production, so it's never typed twice.
-- No minors: youth categories and young-performer credits never name anyone.
-- Only moderators add awards for now.
-- =====================================================================

create table award_ceremonies (
  id             uuid primary key default gen_random_uuid(),
  award_body_id  uuid not null references award_bodies (id) on delete cascade,
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name           text not null,                 -- DASH Awards
  season         text not null,                 -- 2025–26
  year           smallint not null check (year between 1900 and 2100),  -- the year it's held, for sorting
  held_on        date,
  source_url     text check (source_url ~ '^https?://\S+\.\S+'),
  created_at     timestamptz not null default now(),
  unique (award_body_id, name, season)
);
create index on award_ceremonies (year desc);
alter table award_ceremonies enable row level security;
create policy "award_ceremonies readable by all" on award_ceremonies for select using (true);

-- What each category honors:
--   production  the production itself (Outstanding Production)
--   ensemble    the whole cast, no names (Outstanding Ensemble)
--   person      a production, optionally naming one or more people (one entry each)
--   youth       a young performer: the production only, never a name
--   honor       a person, and optionally the company that presented it; no production
alter table award_categories
  add column section    text,
  add column sort_order integer not null default 0,
  add column kind       text not null default 'person' check (kind in ('production', 'ensemble', 'person', 'youth', 'honor'));

alter table award_entries
  add column ceremony_id     uuid references award_ceremonies (id) on delete cascade,
  add column organization_id uuid references organizations (id) on delete cascade,
  add column source_url      text,
  alter column production_id drop not null;

-- There are no entries yet, so these can be required straight away
alter table award_entries
  alter column ceremony_id set not null,
  alter column source_url set not null,
  add constraint award_entries_source_link check (source_url ~ '^https?://\S+\.\S+'),
  add constraint award_entries_honors_someone check (production_id is not null or person_id is not null or organization_id is not null);
create index on award_entries (organization_id);
create index on award_entries (ceremony_id);

drop index award_entries_once;
create unique index award_entries_once on award_entries (
  ceremony_id, category_id,
  coalesce(production_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(person_id, credit_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- The rules, checked on every save
create or replace function award_entry_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cer  award_ceremonies;
  v_cat  award_categories;
  v_cr   credits;
begin
  select * into v_cer from award_ceremonies where id = new.ceremony_id;
  select * into v_cat from award_categories where id = new.category_id;
  if v_cat.award_body_id <> v_cer.award_body_id then raise exception 'That category belongs to different awards'; end if;
  new.award_year := v_cer.year;

  if new.credit_id is not null then
    select * into v_cr from credits where id = new.credit_id;
    if not found or v_cr.production_id is distinct from new.production_id then
      raise exception 'That person isn’t credited in this production';
    end if;
    if v_cr.is_young_performer then new.person_id := null; else new.person_id := v_cr.person_id; end if;
  end if;

  if v_cat.kind = 'honor' then
    new.production_id := null;
    new.credit_id := null;
    if new.person_id is null then raise exception 'Choose who received this honor'; end if;
  else
    if new.production_id is null then raise exception 'Choose the production'; end if;
    new.organization_id := null;   -- the company comes from the production
    if v_cat.kind in ('production', 'ensemble', 'youth') then
      new.person_id := null;       -- no names: the production, the whole cast, or a young performer
      if v_cat.kind <> 'youth' then new.credit_id := null; end if;
    end if;
  end if;
  return new;
end $$;

create trigger award_entries_check before insert or update on award_entries
  for each row execute function award_entry_check();

-- Only moderators write awards for now (reading stays open to all)
drop policy if exists "award_bodies writable by trusted" on award_bodies;
drop policy if exists "award_categories writable by trusted" on award_categories;
drop policy if exists "award_entries writable by trusted" on award_entries;
create policy "award_bodies writable by moderators" on award_bodies for all to authenticated
  using (has_role('moderator')) with check (has_role('moderator'));
create policy "award_categories writable by moderators" on award_categories for all to authenticated
  using (has_role('moderator')) with check (has_role('moderator'));
create policy "award_entries writable by moderators" on award_entries for all to authenticated
  using (has_role('moderator')) with check (has_role('moderator'));
create policy "award_ceremonies writable by moderators" on award_ceremonies for all to authenticated
  using (has_role('moderator')) with check (has_role('moderator'));

-- Internal: save an award proposal as an entry
create or replace function apply_award(p_proposal_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c jsonb;
  v_by uuid;
  v_cer award_ceremonies;
  v_category uuid;
begin
  select changes, proposed_by into c, v_by from edit_proposals where id = p_proposal_id;
  select * into v_cer from award_ceremonies where id = (c ->> 'ceremony_id')::uuid;
  if not found then raise exception 'Choose the ceremony'; end if;

  if nullif(c ->> 'category_id', '') is not null then
    v_category := (c ->> 'category_id')::uuid;
  else
    insert into award_categories (award_body_id, name, section, sort_order, kind)
    values (v_cer.award_body_id, trim(c ->> 'new_category'), nullif(trim(c ->> 'new_section'), ''), 1000,
            coalesce(nullif(c ->> 'new_kind', ''), 'person'))
    on conflict (award_body_id, name) do nothing;
    select id into v_category from award_categories where award_body_id = v_cer.award_body_id and name = trim(c ->> 'new_category');
  end if;

  insert into award_entries (ceremony_id, category_id, award_year, production_id, person_id, credit_id, organization_id,
                             result, source_url, created_by)
  values (v_cer.id, v_category, v_cer.year,
          nullif(c ->> 'production_id', '')::uuid, nullif(c ->> 'person_id', '')::uuid, nullif(c ->> 'credit_id', '')::uuid,
          nullif(c ->> 'organization_id', '')::uuid,
          (c ->> 'result')::award_result, trim(c ->> 'source_url'), v_by)
  on conflict do nothing;
end $$;

-- Moderators enter awards; they publish at once. Returns 'published'.
create or replace function submit_award(p_award jsonb, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not has_role('moderator') then raise exception 'Only moderators can add awards for now'; end if;
  if nullif(p_award ->> 'ceremony_id', '') is null then raise exception 'Choose the ceremony'; end if;
  if nullif(p_award ->> 'category_id', '') is null and nullif(trim(p_award ->> 'new_category'), '') is null then
    raise exception 'Choose the category';
  end if;
  if coalesce(p_award ->> 'result', '') not in ('nominated', 'won') then raise exception 'Choose Nominated or Won'; end if;
  if coalesce(trim(p_award ->> 'source_url'), '') !~ '^https?://\S+\.\S+' then
    raise exception 'Add the link to the page that announced this award';
  end if;

  insert into edit_proposals (entity_table, entity_id, changes, note, proposed_by)
  values ('award_entries', null, p_award, nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;
  perform apply_award(v_id);
  update edit_proposals set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = v_id;
  return 'published';
end $$;

-- ---------------------------------------------------------------------
-- The DASH Awards, with this season's categories (EMACT's own wording)
-- ---------------------------------------------------------------------
update award_bodies set name = 'EMACT', website_url = 'https://www.emact.org' where slug = 'emact';

insert into award_ceremonies (award_body_id, slug, name, season, year, source_url)
select id, 'dash-awards-2025-26', 'DASH Awards', '2025–26', 2026, 'https://www.emact.org/2025-2026-dash-award-winners.html'
  from award_bodies where slug = 'emact';

insert into award_categories (award_body_id, name, section, sort_order, kind)
select b.id, c.name, c.section, c.sort_order, c.kind
  from award_bodies b,
       (values
         ('Lifetime Achievement Award',                    'Special Honors', 10, 'honor'),
         ('Diversity, Equity & Inclusion Impact Award',    'Special Honors', 20, 'honor'),
         ('Outstanding Production Musical',                'Outstanding Production & Ensemble', 110, 'production'),
         ('Outstanding Production Play',                   'Outstanding Production & Ensemble', 120, 'production'),
         ('Outstanding Ensemble Performance Musical',      'Outstanding Production & Ensemble', 130, 'ensemble'),
         ('Outstanding Ensemble Performance Play',         'Outstanding Production & Ensemble', 140, 'ensemble'),
         ('Lead Performer Musical · Comedy',               'Performance', 210, 'person'),
         ('Lead Performer Musical · Drama',                'Performance', 220, 'person'),
         ('Lead Performer Play · Comedy',                  'Performance', 230, 'person'),
         ('Lead Performer Play · Drama',                   'Performance', 240, 'person'),
         ('Supporting Performer Musical · Comedy',         'Performance', 250, 'person'),
         ('Supporting Performer Musical · Drama',          'Performance', 260, 'person'),
         ('Supporting Performer Play · Comedy',            'Performance', 270, 'person'),
         ('Supporting Performer Play · Drama',             'Performance', 280, 'person'),
         ('Youth Performer Musical',                       'Performance', 290, 'youth'),
         ('Youth Performer Play',                          'Performance', 295, 'youth'),
         ('Specialty Ensemble Musical',                    'Performance', 298, 'person'),
         ('Direction Musical',                             'Direction, Music & Movement', 310, 'person'),
         ('Direction Play',                                'Direction, Music & Movement', 320, 'person'),
         ('Music Direction',                               'Direction, Music & Movement', 330, 'person'),
         ('Choreography',                                  'Direction, Music & Movement', 340, 'person'),
         ('Scenic Design Musical',                         'Design', 410, 'person'),
         ('Scenic Design Play',                            'Design', 415, 'person'),
         ('Set Dressing Musical',                          'Design', 420, 'person'),
         ('Set Dressing Play',                             'Design', 425, 'person'),
         ('Lighting Design Musical',                       'Design', 430, 'person'),
         ('Lighting Design Play',                          'Design', 435, 'person'),
         ('Sound Design Musical',                          'Design', 440, 'person'),
         ('Sound Design Play',                             'Design', 445, 'person'),
         ('Costume Design Musical',                        'Design', 450, 'person'),
         ('Costume Design Play',                           'Design', 455, 'person'),
         ('Makeup & Hair Design Musical',                  'Design', 460, 'person'),
         ('Makeup & Hair Design Play',                     'Design', 465, 'person'),
         ('Prop Design Musical',                           'Design', 470, 'person'),
         ('Prop Design Play',                              'Design', 475, 'person'),
         ('Stage Management Musical',                      'Stage Management', 510, 'person'),
         ('Stage Management Play',                         'Stage Management', 520, 'person'),
         ('Best Lead-In to a Song by a Youth Actor',       'Consultant Choice Awards', 610, 'youth'),
         ('Excellence in Dialect Work',                    'Consultant Choice Awards', 620, 'person'),
         ('Excellence in Projection Design',               'Consultant Choice Awards', 630, 'person'),
         ('Excellence in Specialty Makeup',                'Consultant Choice Awards', 640, 'person'),
         ('Badass Combat Award',                           'Consultant Choice Awards', 650, 'person'),
         ('Creature Design',                               'Consultant Choice Awards', 660, 'person'),
         ('A Documentary Play With Music',                 'Consultant Choice Awards', 670, 'person'),
         ('Original Instrumental & Vocal Music',           'Consultant Choice Awards', 680, 'person'),
         ('Achievement in Mechanical Magic: Greased Lightning', 'Consultant Choice Awards', 690, 'person'),
         ('Creative Community Collaboration Award',        'Consultant Choice Awards', 700, 'person'),
         ('Excellence in Fight Direction',                 'Consultant Choice Awards', 710, 'person'),
         ('Distinguished Achievement in Inclusive Casting', 'Consultant Choice Awards', 720, 'person')
       ) as c(name, section, sort_order, kind)
 where b.slug = 'emact'
on conflict (award_body_id, name) do update set section = excluded.section, sort_order = excluded.sort_order, kind = excluded.kind;

-- Merging two companies also moves the honors they presented
create or replace function merge_entities(p_table text, p_keep uuid, p_remove uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_summary jsonb;
  k record;
  r record;
begin
  if not has_role('moderator') then raise exception 'Only moderators can merge'; end if;
  if p_keep = p_remove then raise exception 'Choose two different pages'; end if;
  if p_table not in ('people', 'shows', 'organizations', 'locations', 'productions') then raise exception 'That can’t be merged'; end if;
  execute format('select to_jsonb(t) from %I t where id = $1', p_table) into v_row using p_remove;
  if v_row is null then raise exception 'The page to merge away no longer exists'; end if;
  execute format('select 1 from %I where id = $1', p_table) into k using p_keep;
  if k is null then raise exception 'The page to keep no longer exists'; end if;
  v_summary := merge_preview(p_table, p_keep, p_remove);
  if v_summary ->> 'blocked' is not null then raise exception '%', v_summary ->> 'blocked'; end if;

  -- No "your page changed" notices for the moves (as when deleting)
  perform set_config('app.moderator_delete', 'on', true);

  if p_table = 'people' then
    select * into k from people where id = p_keep;
    select * into r from people where id = p_remove;
    -- The same credit on both: keep one (awards follow it)
    update award_entries a set credit_id = kc.id
      from credits rc join credits kc on kc.person_id = p_keep and kc.production_id = rc.production_id and kc.kind = rc.kind
           and kc.is_understudy = rc.is_understudy
           and coalesce(kc.character_id::text, lower(kc.role_name)) = coalesce(rc.character_id::text, lower(rc.role_name))
     where rc.person_id = p_remove and a.credit_id = rc.id;
    delete from credits rc using credits kc
     where rc.person_id = p_remove and kc.person_id = p_keep and kc.production_id = rc.production_id and kc.kind = rc.kind
       and kc.is_understudy = rc.is_understudy
       and coalesce(kc.character_id::text, lower(kc.role_name)) = coalesce(rc.character_id::text, lower(rc.role_name));
    update credits set person_id = p_keep where person_id = p_remove;
    update award_entries set person_id = p_keep where person_id = p_remove;
    update media set person_id = p_keep where person_id = p_remove;
    delete from follows f using follows f2 where f.person_id = p_remove and f2.person_id = p_keep and f2.user_id = f.user_id;
    update follows set person_id = p_keep where person_id = p_remove;
    delete from notifications where person_id = p_remove and kind <> 'page_changed';
    update notifications set person_id = p_keep where person_id = p_remove;
    -- A claim on the removed page moves over unless the kept one has its own
    if exists (select 1 from person_claims where person_id = p_keep and status in ('pending', 'verified')) then
      delete from person_claims where person_id = p_remove and status in ('pending', 'verified');
    end if;
    update person_claims set person_id = p_keep where person_id = p_remove;
    if r.verified_owner_id is not null and k.verified_owner_id is null then
      update people set verified_owner_id = null where id = p_remove;
      update profiles set person_id = null where person_id = p_remove;
      update people set verified_owner_id = r.verified_owner_id where id = p_keep;
      update profiles set person_id = p_keep where id = r.verified_owner_id;
    else
      update profiles set person_id = null where person_id = p_remove;
    end if;
    update people set bio = coalesce(nullif(k.bio, ''), r.bio),
                      links = case when coalesce(jsonb_array_length(case when jsonb_typeof(k.links) = 'array' then k.links end), 0) = 0 then r.links else k.links end,
                      headshot_media_id = coalesce(k.headshot_media_id, r.headshot_media_id)
     where id = p_keep;

  elsif p_table = 'shows' then
    select * into k from shows where id = p_keep;
    select * into r from shows where id = p_remove;
    -- Roles with the same name become one
    update credits c set character_id = kc.id
      from show_characters rc join show_characters kc on kc.show_id = p_keep and lower(kc.name) = lower(rc.name)
     where rc.show_id = p_remove and c.character_id = rc.id;
    delete from show_characters rc using show_characters kc
     where rc.show_id = p_remove and kc.show_id = p_keep and lower(kc.name) = lower(rc.name);
    update show_characters set show_id = p_keep where show_id = p_remove;
    update productions set show_id = p_keep where show_id = p_remove;
    update shows set authors = coalesce(nullif(k.authors, ''), r.authors), subtitle = coalesce(nullif(k.subtitle, ''), r.subtitle),
                     synopsis = coalesce(nullif(k.synopsis, ''), r.synopsis), premiere_year = coalesce(k.premiere_year, r.premiere_year)
     where id = p_keep;

  elsif p_table = 'organizations' then
    select * into k from organizations where id = p_keep;
    select * into r from organizations where id = p_remove;
    update productions set organization_id = p_keep where organization_id = p_remove;
    update media set organization_id = p_keep where organization_id = p_remove;
    update award_entries set organization_id = p_keep where organization_id = p_remove;
    delete from follows f using follows f2 where f.organization_id = p_remove and f2.organization_id = p_keep and f2.user_id = f.user_id;
    update follows set organization_id = p_keep where organization_id = p_remove;
    insert into organization_locations (organization_id, location_id)
    select p_keep, location_id from organization_locations where organization_id = p_remove on conflict do nothing;
    delete from organization_locations where organization_id = p_remove;
    update organizations set town = coalesce(k.town, r.town), website_url = coalesce(nullif(k.website_url, ''), r.website_url),
                             description = coalesce(nullif(k.description, ''), r.description), founded_year = coalesce(k.founded_year, r.founded_year),
                             short_name = coalesce(nullif(k.short_name, ''), r.short_name), logo_media_id = coalesce(k.logo_media_id, r.logo_media_id)
     where id = p_keep;

  elsif p_table = 'locations' then
    select * into k from locations where id = p_keep;
    select * into r from locations where id = p_remove;
    update productions set location_id = p_keep where location_id = p_remove;
    update performances set location_id = p_keep where location_id = p_remove;
    update auditions set location_id = p_keep where location_id = p_remove;
    insert into organization_locations (organization_id, location_id)
    select organization_id, p_keep from organization_locations where location_id = p_remove on conflict do nothing;
    delete from organization_locations where location_id = p_remove;
    -- The kept venue's pin stays; it takes the other's if it has none
    update locations set street_address = coalesce(nullif(k.street_address, ''), r.street_address), town = coalesce(k.town, r.town),
                         postal_code = coalesce(nullif(k.postal_code, ''), r.postal_code), description = coalesce(nullif(k.description, ''), r.description),
                         seating_capacity = coalesce(k.seating_capacity, r.seating_capacity),
                         latitude = coalesce(k.latitude, r.latitude), longitude = coalesce(k.longitude, r.longitude),
                         pin_by_hand = k.pin_by_hand or (k.latitude is null and r.pin_by_hand)
     where id = p_keep;

  else -- productions
    select * into k from productions where id = p_keep;
    select * into r from productions where id = p_remove;
    update award_entries a set credit_id = kc.id
      from credits rc join credits kc on kc.production_id = p_keep and kc.kind = rc.kind and kc.is_understudy = rc.is_understudy
           and kc.is_young_performer = rc.is_young_performer and kc.person_id is not distinct from rc.person_id
           and coalesce(kc.character_id::text, lower(kc.role_name)) = coalesce(rc.character_id::text, lower(rc.role_name))
     where rc.production_id = p_remove and a.credit_id = rc.id;
    delete from credits rc using credits kc
     where rc.production_id = p_remove and kc.production_id = p_keep and kc.kind = rc.kind and kc.is_understudy = rc.is_understudy
       and kc.is_young_performer = rc.is_young_performer and kc.person_id is not distinct from rc.person_id
       and coalesce(kc.character_id::text, lower(kc.role_name)) = coalesce(rc.character_id::text, lower(rc.role_name));
    update credits set production_id = p_keep where production_id = p_remove;
    delete from performances rp using performances kp where rp.production_id = p_remove and kp.production_id = p_keep and kp.starts_at = rp.starts_at;
    update performances set production_id = p_keep where production_id = p_remove;
    update auditions set production_id = p_keep where production_id = p_remove;
    update media set production_id = p_keep where production_id = p_remove;
    delete from watch_list w using watch_list w2 where w.production_id = p_remove and w2.production_id = p_keep and w2.user_id = w.user_id;
    update watch_list set production_id = p_keep where production_id = p_remove;
    delete from audition_follows a using audition_follows a2 where a.production_id = p_remove and a2.production_id = p_keep and a2.user_id = a.user_id;
    update audition_follows set production_id = p_keep where production_id = p_remove;
    delete from award_entries ra using award_entries ka
     where ra.production_id = p_remove and ka.production_id = p_keep and ka.category_id = ra.category_id and ka.award_year = ra.award_year
       and coalesce(ka.person_id, ka.credit_id) is not distinct from coalesce(ra.person_id, ra.credit_id);
    update award_entries set production_id = p_keep where production_id = p_remove;
    delete from notifications where production_id = p_remove;
    -- Blanks filled from the other; its poster (and colors) if this has none
    update productions set
      opening_date = coalesce(k.opening_date, r.opening_date), closing_date = coalesce(k.closing_date, r.closing_date),
      description = coalesce(nullif(k.description, ''), r.description), ticket_url = coalesce(k.ticket_url, r.ticket_url),
      location_id = coalesce(k.location_id, r.location_id), audition_note = coalesce(nullif(k.audition_note, ''), r.audition_note),
      audition_url = coalesce(k.audition_url, r.audition_url),
      poster_media_id = coalesce(k.poster_media_id, r.poster_media_id),
      color_ground = case when k.poster_media_id is null then r.color_ground else k.color_ground end,
      color_ground_2 = case when k.poster_media_id is null then r.color_ground_2 else k.color_ground_2 end,
      color_ink = case when k.poster_media_id is null then r.color_ink else k.color_ink end,
      color_soft = case when k.poster_media_id is null then r.color_soft else k.color_soft end,
      color_accent = case when k.poster_media_id is null then r.color_accent else k.color_accent end,
      color_edge = case when k.poster_media_id is null then r.color_edge else k.color_edge end
     where id = p_keep;
    update productions set poster_media_id = null where id = p_remove;
  end if;

  -- Pending edits, Hotlist visits and the old address follow along
  update edit_proposals set entity_id = p_keep where entity_table = p_table and entity_id = p_remove and status = 'pending';
  delete from page_views v using page_views v2
   where v.entity_table = p_table and v.entity_id = p_remove and v2.entity_table = p_table and v2.entity_id = p_keep
     and v2.day = v.day and v2.visitor_hash = v.visitor_hash;
  update page_views set entity_id = p_keep where entity_table = p_table and entity_id = p_remove;
  delete from duplicate_dismissals where entity_table = p_table and (a_id = p_remove or b_id = p_remove);

  execute format('delete from %I where id = $1', p_table) using p_remove;
  insert into merges (entity_table, kept_id, removed_id, removed_slug, removed_row, summary, merged_by)
  values (p_table, p_keep, p_remove, v_row ->> 'slug', v_row, v_summary, auth.uid());
  -- Earlier merges into the removed page now point at the kept one
  update merges set kept_id = p_keep where entity_table = p_table and kept_id = p_remove;

  perform set_config('app.moderator_delete', '', true);
  return v_summary;
end $$;
