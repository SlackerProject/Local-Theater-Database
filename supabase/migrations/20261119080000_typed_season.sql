-- A company's season, as the company describes it: the months it runs and
-- how many musicals, plays and other shows it does each year. Replaces the
-- season the page used to work out from productions. Also drops the old
-- typed audition style (never used; replaced by a link).

alter table organizations
  drop column audition_style,
  add column season_start_month smallint check (season_start_month between 1 and 12),
  add column season_end_month smallint check (season_end_month between 1 and 12),
  add column musicals_per_season smallint check (musicals_per_season between 0 and 50),
  add column plays_per_season smallint check (plays_per_season between 0 and 50),
  add column other_per_season smallint check (other_per_season between 0 and 50);

create or replace function correction_fields(p_table text) returns text[]
language sql immutable as $$
  select case p_table
    when 'productions' then array['year', 'title_override', 'opening_date', 'closing_date', 'description',
                                  'ticket_url', 'organization_id', 'location_id', 'program_id']
    when 'people' then array['display_name', 'bio']
    when 'organizations' then array['name', 'short_name', 'town', 'state', 'website_url', 'founded_year', 'description',
                                    'is_nonprofit', 'home_location_id',
                                    'season_start_month', 'season_end_month', 'musicals_per_season', 'plays_per_season', 'other_per_season',
                                    'ticket_price', 'ticket_prices', 'pass_price', 'pass_shows', 'tickets_url',
                                    'audition_info_url', 'facebook_url', 'instagram_url', 'youtube_url',
                                    'membership_url', 'volunteer_url', 'house_staff_url', 'newsletter_url', 'donate_url']
    when 'shows' then array['title', 'subtitle', 'type', 'authors', 'premiere_year', 'synopsis']
    when 'locations' then array['name', 'stage_name', 'street_address', 'town', 'state', 'postal_code', 'seating_capacity',
                                'seating_style', 'accessibility', 'description']
  end;
$$;

-- Merging keeps the season
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
    update productions p set program_id = kp.id, organization_id = p_keep
      from company_programs rp join company_programs kp on kp.organization_id = p_keep and lower(kp.name) = lower(rp.name)
     where rp.organization_id = p_remove and p.program_id = rp.id;
    delete from company_programs rp using company_programs kp
     where rp.organization_id = p_remove and kp.organization_id = p_keep and lower(kp.name) = lower(rp.name);
    update company_programs set organization_id = p_keep where organization_id = p_remove;
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
                             short_name = coalesce(nullif(k.short_name, ''), r.short_name), logo_media_id = coalesce(k.logo_media_id, r.logo_media_id),
                             home_location_id = coalesce(k.home_location_id, r.home_location_id),
                             ticket_price = coalesce(k.ticket_price, r.ticket_price), ticket_prices = coalesce(nullif(k.ticket_prices, ''), r.ticket_prices), pass_price = coalesce(k.pass_price, r.pass_price),
                             pass_shows = coalesce(k.pass_shows, r.pass_shows), is_nonprofit = coalesce(k.is_nonprofit, r.is_nonprofit),
                             audition_info_url = coalesce(k.audition_info_url, r.audition_info_url),
                             season_start_month = coalesce(k.season_start_month, r.season_start_month),
                             season_end_month = coalesce(k.season_end_month, r.season_end_month),
                             musicals_per_season = coalesce(k.musicals_per_season, r.musicals_per_season),
                             plays_per_season = coalesce(k.plays_per_season, r.plays_per_season),
                             other_per_season = coalesce(k.other_per_season, r.other_per_season),
                             tickets_url = coalesce(nullif(k.tickets_url, ''), r.tickets_url), facebook_url = coalesce(nullif(k.facebook_url, ''), r.facebook_url),
                             instagram_url = coalesce(nullif(k.instagram_url, ''), r.instagram_url), youtube_url = coalesce(nullif(k.youtube_url, ''), r.youtube_url),
                             membership_url = coalesce(k.membership_url, r.membership_url), volunteer_url = coalesce(k.volunteer_url, r.volunteer_url),
                             house_staff_url = coalesce(k.house_staff_url, r.house_staff_url), newsletter_url = coalesce(k.newsletter_url, r.newsletter_url),
                             donate_url = coalesce(k.donate_url, r.donate_url)
     where id = p_keep;

  elsif p_table = 'locations' then
    select * into k from locations where id = p_keep;
    select * into r from locations where id = p_remove;
    update productions set location_id = p_keep where location_id = p_remove;
    update performances set location_id = p_keep where location_id = p_remove;
    update auditions set location_id = p_keep where location_id = p_remove;
    update organizations set home_location_id = p_keep where home_location_id = p_remove;
    update media set location_id = p_keep where location_id = p_remove;
    insert into organization_locations (organization_id, location_id)
    select organization_id, p_keep from organization_locations where location_id = p_remove on conflict do nothing;
    delete from organization_locations where location_id = p_remove;
    -- The kept venue's pin stays; it takes the other's if it has none
    update locations set street_address = coalesce(nullif(k.street_address, ''), r.street_address), stage_name = coalesce(nullif(k.stage_name, ''), r.stage_name),
                         seating_style = coalesce(k.seating_style, r.seating_style), accessibility = coalesce(nullif(k.accessibility, ''), r.accessibility),
                         seating_chart_media_id = coalesce(k.seating_chart_media_id, r.seating_chart_media_id), town = coalesce(k.town, r.town),
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
      location_id = coalesce(k.location_id, r.location_id),
      program_id = case when k.organization_id = r.organization_id then coalesce(k.program_id, r.program_id) else k.program_id end,
      audition_note = coalesce(nullif(k.audition_note, ''), r.audition_note),
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
