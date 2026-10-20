-- =====================================================================
-- Local Theater Database: migration 0036
-- Theater map views: all theaters, shows in the next 30 days, auditions
-- in the next 30 days
--
--   map_venues() now also returns, per venue:
--     shows_soon      a performance there in the next 30 days (or, for a
--                     production with no performances listed, a run that
--                     overlaps them)
--     auditions_soon  an audition session there in the next 30 days (at
--                     the session's venue, or the production's when the
--                     session doesn't name one)
--     next_audition   the soonest of those sessions
--   Venues holding auditions are included even without a recent show.
--   playing_soon (60 days) is gone.
-- Runs after 0035 (20261020020000_venue_map.sql).
-- =====================================================================

drop function if exists map_venues();

create function map_venues()
returns table (id uuid, slug text, name text, address text, latitude numeric, longitude numeric,
               companies jsonb, next_show jsonb, next_audition jsonb,
               recent boolean, shows_soon boolean, auditions_soon boolean)
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
  ),
  shows_soon as (
    select distinct coalesce(pf.location_id, p.location_id) location_id
    from performances pf join productions p on p.id = pf.production_id
    where not p.is_hidden and not pf.is_cancelled
      and pf.starts_at >= now() and pf.starts_at < now() + interval '30 days'
    union
    select p.location_id from productions p
    where not p.is_hidden and p.location_id is not null
      and not exists (select 1 from performances pf where pf.production_id = p.id)
      and p.closing_date >= (select d from today) and p.opening_date < (select d from today) + 30
  ),
  auditions_soon as (
    select a.id, coalesce(a.location_id, p.location_id) location_id, a.starts_at, a.label, p.slug,
           coalesce(p.title_override, s.title) title, p.year, o.name company
    from auditions a
    join productions p on p.id = a.production_id and not p.is_hidden
    join shows s on s.id = p.show_id
    join organizations o on o.id = p.organization_id
    where a.starts_at >= now() and a.starts_at < now() + interval '30 days'
  )
  select l.id, l.slug, l.name,
         concat_ws(', ', nullif(trim(l.street_address), ''), nullif(trim(l.town), '')),
         l.latitude, l.longitude,
         (select jsonb_agg(distinct jsonb_build_object('name', o.name, 'slug', o.slug))
            from (select production_id from recent where location_id = l.id
                  union select p.id from auditions_soon a join productions p on p.slug = a.slug where a.location_id = l.id) r
            join productions p on p.id = r.production_id join organizations o on o.id = p.organization_id),
         (select jsonb_build_object('title', coalesce(p.title_override, s.title), 'year', p.year, 'slug', p.slug,
                                    'opening', p.opening_date, 'closing', p.closing_date, 'company', o.name)
            from recent r join productions p on p.id = r.production_id
            join shows s on s.id = p.show_id join organizations o on o.id = p.organization_id
           where r.location_id = l.id and p.closing_date >= (select d from today)
           order by p.opening_date nulls last limit 1),
         (select jsonb_build_object('title', a.title, 'year', a.year, 'slug', a.slug, 'starts_at', a.starts_at,
                                    'label', a.label, 'company', a.company)
            from auditions_soon a where a.location_id = l.id order by a.starts_at limit 1),
         exists (select 1 from recent r where r.location_id = l.id),
         exists (select 1 from shows_soon s where s.location_id = l.id),
         exists (select 1 from auditions_soon a where a.location_id = l.id)
  from locations l
  where l.latitude is not null and l.longitude is not null
    and (exists (select 1 from recent r where r.location_id = l.id)
         or exists (select 1 from auditions_soon a where a.location_id = l.id))
  order by l.name;
$$;
grant execute on function map_venues() to anon, authenticated;
