-- =====================================================================
-- Local Theater Database: migration 0016
-- A live Hotlist: rankings are counted straight from page_views each time
-- the page loads (unique visitors over today and the previous six days),
-- instead of an hourly snapshot. The hourly refresh job and the
-- hotlist_7d snapshot are no longer needed.
-- Runs after 0015 (20261012010000_recent_contributions_fix.sql).
-- =====================================================================

-- Fast counting for one kind of page over recent days
create index if not exists page_views_table_day on page_views (entity_table, day);

-- Unique visitors per page over the rolling 7 days (visits are recorded by
-- day, so "7 days" is today plus the six days before)
create or replace function hotlist_counts(p_table text)
returns table (entity_id uuid, visitors int)
language sql stable security definer set search_path = public as $$
  select entity_id, count(*)::int
  from page_views
  where entity_table = p_table and day > current_date - 7
  group by entity_id;
$$;

create or replace function hotlist(p_table text, p_limit int default 25)
returns table (entity_id uuid, visitors int, rank int, last_week_rank int, has_history boolean)
language sql stable security definer set search_path = public as $$
  with ranked as (
    select h.entity_id, h.visitors,
           row_number() over (order by h.visitors desc, h.entity_id)::int rank
    from hotlist_counts(p_table) h
    where (p_table <> 'people' or exists (select 1 from people pe where pe.id = h.entity_id and not pe.is_hidden))
      and (p_table <> 'productions' or exists (select 1 from productions pr where pr.id = h.entity_id and not pr.is_hidden))
  ),
  history as (select exists (select 1 from hotlist_snapshots where day = current_date - 7 and entity_table = p_table) h)
  select r.entity_id, r.visitors, r.rank, s.rank, (select h from history)
  from ranked r
  left join hotlist_snapshots s on s.day = current_date - 7 and s.entity_table = p_table and s.entity_id = r.entity_id
  where r.rank <= least(p_limit, 100)
  order by r.rank;
$$;

-- The daily snapshot (for "up/down since last week") now uses the live counts
create or replace function snapshot_hotlist() returns void
language sql security definer set search_path = public as $$
  insert into hotlist_snapshots (day, entity_table, entity_id, rank)
  select current_date, t, entity_id, rank
  from unnest(array['people', 'productions', 'shows']) t,
       lateral (select entity_id, row_number() over (order by visitors desc, entity_id)::int rank
                from hotlist_counts(t)) r
  where rank <= 100
  on conflict do nothing;
  delete from hotlist_snapshots where day < current_date - 35;
$$;

select cron.unschedule('hotlist-refresh');
drop materialized view if exists hotlist_7d;

revoke execute on function hotlist_counts(text) from public, anon, authenticated;
grant execute on function hotlist(text, int) to anon, authenticated;
