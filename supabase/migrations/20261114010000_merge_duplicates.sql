-- =====================================================================
-- Local Theater Database: migration 0044
-- Merging duplicates (moderators)
--
--   * potential_duplicates(): likely duplicate pairs: people with the same
--     name, shows with the same title, companies or venues with the same
--     name (venues: same or unknown town), productions of the same show by
--     the same company in the same year. Pairs a moderator dismissed
--     ("Not a duplicate") don't come back.
--   * dismiss_duplicate(): records that dismissal.
--   * merge_preview(): what a merge would move.
--   * merge_entities(): moves everything from one page to the other, fills
--     the kept page's blanks from it, then deletes it. Its old address
--     forwards to the kept page (merges.removed_slug). Owners aren't sent
--     "your page changed" notices for the moves (as for deleting).
--   * Two people both claimed by different members can't be merged.
-- Runs after 0043 (20261114000000_ticket_links.sql).
-- =====================================================================

create table merges (
  id            uuid primary key default gen_random_uuid(),
  entity_table  text not null check (entity_table in ('people', 'shows', 'organizations', 'locations', 'productions')),
  kept_id       uuid not null,
  removed_id    uuid not null,
  removed_slug  text not null,
  removed_row   jsonb not null,
  summary       jsonb not null default '{}',
  merged_by     uuid references profiles (id) on delete set null,
  merged_at     timestamptz not null default now()
);
create index on merges (entity_table, removed_slug);
alter table merges enable row level security;
create policy "moderators read merges" on merges for select using (has_role('moderator'));

create table duplicate_dismissals (
  entity_table  text not null,
  a_id          uuid not null,
  b_id          uuid not null,
  dismissed_by  uuid references profiles (id) on delete set null,
  dismissed_at  timestamptz not null default now(),
  primary key (entity_table, a_id, b_id),
  check (a_id < b_id)
);
alter table duplicate_dismissals enable row level security;
create policy "moderators read dismissals" on duplicate_dismissals for select using (has_role('moderator'));

-- "The Footlight Club" and "footlight club" match
create or replace function name_match_key(p text) returns text
language sql immutable as $$
  select regexp_replace(regexp_replace(lower(coalesce(p, '')), '^\s*the\s+', ''), '[^a-z0-9]+', '', 'g');
$$;

-- An old address of a merged page: where it went
create or replace function merged_into(p_table text, p_slug text) returns uuid
language sql stable security definer set search_path = public as $$
  select kept_id from merges where entity_table = p_table and removed_slug = p_slug order by merged_at desc limit 1;
$$;
grant execute on function merged_into(text, text) to anon, authenticated;

-- A short description of a page, to tell two apart
create or replace function merge_detail(p_table text, p_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v text;
begin
  if p_table = 'people' then
    select count(distinct c.production_id) || ' production' || case when count(distinct c.production_id) = 1 then '' else 's' end
           || coalesce(' · latest ' || (select coalesce(p.title_override, s.title) || ' (' || p.year || ')'
                from credits c2 join productions p on p.id = c2.production_id join shows s on s.id = p.show_id
               where c2.person_id = p_id order by p.year desc limit 1), '')
           || case when (select verified_owner_id from people where id = p_id) is not null then ' · claimed' else '' end
      into v from credits c where c.person_id = p_id;
  elsif p_table = 'shows' then
    select count(*) || ' production' || case when count(*) = 1 then '' else 's' end || coalesce(' · ' || (select authors from shows where id = p_id), '')
      into v from productions where show_id = p_id;
  elsif p_table = 'organizations' then
    select count(*) || ' production' || case when count(*) = 1 then '' else 's' end || coalesce(' · ' || (select town from organizations where id = p_id), '')
      into v from productions where organization_id = p_id;
  elsif p_table = 'locations' then
    select concat_ws(' · ', nullif(concat_ws(', ', l.street_address, l.town), ''),
                     (select count(*) from productions where location_id = p_id) || ' productions')
      into v from locations l where l.id = p_id;
  elsif p_table = 'productions' then
    select concat_ws(' · ', o.name, nullif(concat_ws(' – ', p.opening_date, p.closing_date), ''),
                     (select count(*) from credits where production_id = p_id) || ' credits',
                     case when p.poster_media_id is not null then 'poster' end)
      into v from productions p join organizations o on o.id = p.organization_id where p.id = p_id;
  end if;
  return v;
end $$;

create or replace function potential_duplicates()
returns table (entity_table text, a_id uuid, a_label text, a_slug text, a_detail text, b_id uuid, b_label text, b_slug text, b_detail text, reason text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_role('moderator') then raise exception 'Only moderators can see this'; end if;
  return query
  with pairs as (
    select 'people'::text t, a.id a, b.id b, a.display_name al, a.slug aslug, b.display_name bl, b.slug bslug, 'Same name' r
      from people a join people b on person_name_key(a.display_name) = person_name_key(b.display_name) and a.id < b.id
    union all
    select 'shows', a.id, b.id, a.title, a.slug, b.title, b.slug, 'Same title'
      from shows a join shows b on name_match_key(a.title) = name_match_key(b.title) and a.id < b.id
    union all
    select 'organizations', a.id, b.id, a.name, a.slug, b.name, b.slug, 'Same name'
      from organizations a join organizations b on name_match_key(a.name) = name_match_key(b.name) and a.id < b.id
    union all
    select 'locations', a.id, b.id, a.name || coalesce(', ' || a.town, ''), a.slug, b.name || coalesce(', ' || b.town, ''), b.slug, 'Same name'
      from locations a join locations b on name_match_key(a.name) = name_match_key(b.name) and a.id < b.id
       and (a.town is null or b.town is null or lower(a.town) = lower(b.town))
    union all
    select 'productions', a.id, b.id, coalesce(a.title_override, sa.title) || ' (' || a.year || ')', a.slug,
           coalesce(b.title_override, sb.title) || ' (' || b.year || ')', b.slug, 'Same show, company and year'
      from productions a join productions b on a.show_id = b.show_id and a.organization_id = b.organization_id and a.year = b.year and a.id < b.id
      join shows sa on sa.id = a.show_id join shows sb on sb.id = b.show_id
  )
  select p.t, p.a, p.al, p.aslug, merge_detail(p.t, p.a), p.b, p.bl, p.bslug, merge_detail(p.t, p.b), p.r
  from pairs p
  where not exists (select 1 from duplicate_dismissals d where d.entity_table = p.t and d.a_id = p.a and d.b_id = p.b)
  order by array_position(array['people', 'productions', 'shows', 'organizations', 'locations'], p.t), p.al
  limit 300;
end $$;

create or replace function dismiss_duplicate(p_table text, p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('moderator') then raise exception 'Only moderators can do this'; end if;
  insert into duplicate_dismissals (entity_table, a_id, b_id, dismissed_by)
  values (p_table, least(p_a, p_b), greatest(p_a, p_b), auth.uid())
  on conflict do nothing;
end $$;

-- What moving everything from p_remove to p_keep would involve
create or replace function merge_preview(p_table text, p_keep uuid, p_remove uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not has_role('moderator') then raise exception 'Only moderators can merge'; end if;
  if p_table = 'people' then
    v := jsonb_build_object(
      'credits', (select count(*) from credits where person_id = p_remove),
      'photos', (select count(*) from media where person_id = p_remove),
      'followers', (select count(*) from follows where person_id = p_remove),
      'awards', (select count(*) from award_entries where person_id = p_remove),
      'blocked', case when (select verified_owner_id from people where id = p_keep) is not null
                       and (select verified_owner_id from people where id = p_remove) is not null
                       and (select verified_owner_id from people where id = p_keep) <> (select verified_owner_id from people where id = p_remove)
                      then 'Both pages are claimed by different members, so they can’t be merged. Check with them first.' end);
  elsif p_table = 'shows' then
    v := jsonb_build_object('productions', (select count(*) from productions where show_id = p_remove),
                            'roles', (select count(*) from show_characters where show_id = p_remove));
  elsif p_table = 'organizations' then
    v := jsonb_build_object('productions', (select count(*) from productions where organization_id = p_remove),
                            'followers', (select count(*) from follows where organization_id = p_remove),
                            'venues', (select count(*) from organization_locations where organization_id = p_remove));
  elsif p_table = 'locations' then
    v := jsonb_build_object('productions', (select count(*) from productions where location_id = p_remove),
                            'performances', (select count(*) from performances where location_id = p_remove),
                            'auditions', (select count(*) from auditions where location_id = p_remove));
  elsif p_table = 'productions' then
    v := jsonb_build_object('credits', (select count(*) from credits where production_id = p_remove),
                            'performances', (select count(*) from performances where production_id = p_remove),
                            'photos', (select count(*) from media where production_id = p_remove),
                            'saved', (select count(*) from watch_list where production_id = p_remove),
                            'auditions', (select count(*) from auditions where production_id = p_remove));
  else
    raise exception 'That can’t be merged';
  end if;
  return v;
end $$;

-- Move everything from p_remove to p_keep, then delete p_remove
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

revoke execute on function potential_duplicates(), dismiss_duplicate(text, uuid, uuid), merge_preview(text, uuid, uuid),
  merge_entities(text, uuid, uuid), merge_detail(text, uuid) from public, anon;
grant execute on function potential_duplicates(), dismiss_duplicate(text, uuid, uuid), merge_preview(text, uuid, uuid),
  merge_entities(text, uuid, uuid) to authenticated;
