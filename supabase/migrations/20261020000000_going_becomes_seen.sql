-- =====================================================================
-- Local Theater Database: migration 0033
-- "Going" becomes "Seen" once the night has passed
--
--   * mark_past_going_seen(): a "going" whose performance has started
--     (or, with no night picked, whose run has closed) becomes "seen",
--     keeping the night. Runs every 15 minutes, and once now.
--   * calendar_feed(): past nights stay in the phone calendar after they
--     turn into "seen".
-- Runs after 0032 (20261019010000_feedback_replies.sql).
-- =====================================================================

create or replace function mark_past_going_seen() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update watch_list w set status = 'seen'
  where w.status = 'going'
    and (
      exists (select 1 from performances pf where pf.id = w.performance_id and pf.starts_at < now())
      or (w.performance_id is null and exists (
            select 1 from productions p where p.id = w.production_id
              and p.closing_date < (now() at time zone 'America/New_York')::date))
    );
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function mark_past_going_seen() from public, anon, authenticated;

select cron.schedule('going-to-seen', '*/15 * * * *', 'select public.mark_past_going_seen()');
select mark_past_going_seen();

create or replace function calendar_feed(p_token text)
returns table (performance_id uuid, starts_at timestamptz, label text, production_slug text,
               title text, year smallint, company text, venue text, address text)
language sql stable security definer set search_path = public as $$
  select * from (
    select pf.id, pf.starts_at, pf.label, p.slug,
           coalesce(p.title_override, s.title), p.year, o.name, l.name,
           concat_ws(', ', l.street_address, l.town, l.state)
    from calendar_feeds cf
    join watch_list w on w.user_id = cf.user_id and w.status in ('going', 'seen') and w.performance_id is not null
    join performances pf on pf.id = w.performance_id and not pf.is_cancelled
    join productions p on p.id = w.production_id and not p.is_hidden
    join shows s on s.id = p.show_id
    join organizations o on o.id = p.organization_id
    left join locations l on l.id = coalesce(pf.location_id, p.location_id)
    where cf.token = p_token and length(p_token) >= 32
      and pf.starts_at > now() - interval '60 days'
    union all
    select a.id, a.starts_at, coalesce(a.label, 'Auditions'), p.slug,
           coalesce(a.label, 'Auditions') || ': ' || coalesce(p.title_override, s.title), p.year, o.name,
           coalesce(l.name, a.place), nullif(concat_ws(', ', l.street_address, l.town, l.state), '')
    from calendar_feeds cf
    join audition_follows af on af.user_id = cf.user_id
    join auditions a on a.production_id = af.production_id
    left join locations l on l.id = a.location_id
    join productions p on p.id = af.production_id and not p.is_hidden
    join shows s on s.id = p.show_id
    join organizations o on o.id = p.organization_id
    where cf.token = p_token and length(p_token) >= 32
      and a.starts_at > now() - interval '60 days'
  ) x
  order by 2;
$$;
