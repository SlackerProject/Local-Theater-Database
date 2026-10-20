-- =====================================================================
-- Local Theater Database: migration 0035
-- The theater map
--
--   * Venues get map pins from the U.S. Census Bureau's free address
--     lookup (no key, US street addresses), done by the site's server
--     and saved with set_venue_pin(). Changing a venue's address clears
--     its pin so it's looked up again (unless a moderator placed the pin
--     by hand: pin_by_hand).
--   * map_venues(): venues with a pin and a production in the last two
--     years, with the companies that perform there and what's on next.
-- Runs after 0034 (20261020010000_moderation_stats.sql).
-- =====================================================================

alter table locations
  add column geocoded_at     timestamptz,
  add column geocode_failed  boolean not null default false,
  add column pin_by_hand     boolean not null default false;

-- A new address means a new pin
create or replace function locations_address_changed() returns trigger
language plpgsql as $$
begin
  if (new.street_address, new.town, new.state, new.postal_code) is distinct from
     (old.street_address, old.town, old.state, old.postal_code)
     and not new.pin_by_hand
     and (new.latitude, new.longitude) is not distinct from (old.latitude, old.longitude) then
    new.latitude := null;
    new.longitude := null;
    new.geocoded_at := null;
    new.geocode_failed := false;
  end if;
  return new;
end $$;
create trigger locations_address_changed before update on locations
  for each row execute function locations_address_changed();

-- Save a pin found by the site's server (the U.S. Census Bureau's address
-- lookup blocks requests from the database server, so the site looks
-- venues up while a moderator works the review queue). Moderators only;
-- only fills a missing pin. No match (null) marks the venue as failed, so
-- it isn't looked up again until its address changes.
create or replace function set_venue_pin(p_id uuid, p_latitude numeric, p_longitude numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('moderator') then raise exception 'Only moderators can do this'; end if;
  if p_latitude is not null and (p_latitude not between 40 and 44 or p_longitude not between -74.5 and -69) then
    raise exception 'That pin is outside Massachusetts';
  end if;
  update locations
     set latitude = p_latitude, longitude = p_longitude,
         geocode_failed = p_latitude is null, geocoded_at = now()
   where id = p_id and latitude is null;
end $$;
revoke execute on function set_venue_pin(uuid, numeric, numeric) from public, anon;
grant execute on function set_venue_pin(uuid, numeric, numeric) to authenticated;

-- Venues for the map: pinned, with a production in the last two years
create or replace function map_venues()
returns table (id uuid, slug text, name text, address text, latitude numeric, longitude numeric,
               companies jsonb, next_show jsonb, playing_soon boolean)
language sql stable security definer set search_path = public as $$
  with today as (select (now() at time zone 'America/New_York')::date d),
  recent as (
    -- a production uses a venue directly, or through one of its performances
    select distinct p.id production_id, v.location_id
    from productions p
    cross join lateral (
      select p.location_id union select pf.location_id from performances pf where pf.production_id = p.id and pf.location_id is not null
    ) v(location_id)
    where not p.is_hidden and v.location_id is not null
      and coalesce(p.closing_date, p.opening_date, make_date(p.year, 12, 31)) >= (select d from today) - interval '2 years'
  )
  select l.id, l.slug, l.name,
         concat_ws(', ', nullif(trim(l.street_address), ''), nullif(trim(l.town), '')),
         l.latitude, l.longitude,
         (select jsonb_agg(distinct jsonb_build_object('name', o.name, 'slug', o.slug))
            from recent r join productions p on p.id = r.production_id join organizations o on o.id = p.organization_id
           where r.location_id = l.id),
         (select jsonb_build_object('title', coalesce(p.title_override, s.title), 'year', p.year, 'slug', p.slug,
                                    'opening', p.opening_date, 'closing', p.closing_date, 'company', o.name)
            from recent r join productions p on p.id = r.production_id
            join shows s on s.id = p.show_id join organizations o on o.id = p.organization_id
           where r.location_id = l.id and p.closing_date >= (select d from today)
           order by p.opening_date nulls last limit 1),
         exists (select 1 from recent r join productions p on p.id = r.production_id
                  where r.location_id = l.id and p.closing_date >= (select d from today)
                    and p.opening_date <= (select d from today) + 60)
  from locations l
  where l.latitude is not null and l.longitude is not null
    and exists (select 1 from recent r where r.location_id = l.id)
  order by l.name;
$$;
grant execute on function map_venues() to anon, authenticated;
