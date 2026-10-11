-- =====================================================================
-- Local Theater Database: migration 0014
-- Milestone 6: weighted points, badges, the Hotlist and awards
--
-- Adds:
--   * Weighted points: 10 per production submission (first approval of a
--     submission only), 3 per poster, 2 per photo or headshot, 2 per
--     correction or other smaller edit. Existing points are recalculated
--     from the approved contributions under these rules.
--   * Badges: contributor levels (Bronze I to Diamond) and collectible
--     badges (moderator, verified performer, founding member, shows seen,
--     photos added), recorded with the date earned in user_badges and kept
--     current by triggers. seen_at drives a one-time "You reached ..."
--     message. A site setting ends the founding-member period.
--   * Profiles: show_seen (hidden by default), stats and recent
--     contributions for /u/[username].
--   * Hotlist: record_view() checks its input; hourly refresh of
--     hotlist_7d, a daily rank snapshot for week-on-week movement, and
--     a daily trim of old page views, all scheduled with pg_cron.
--   * Awards: EMACT as an award body; submit_award() for trusted editors
--     and moderators (moderators publish at once, others wait for review).
-- Runs after 0013 (20261011060000_corrections_and_member_tools.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Points
-- ---------------------------------------------------------------------
alter table point_events drop constraint point_events_reason_check;
alter table point_events add constraint point_events_reason_check check (reason in (
  'production_approved', 'poster_approved', 'photo_approved', 'edit_approved', 'adjustment'));
-- One award per contribution (adjustments are free-form)
create unique index point_events_once on point_events (ref_id, reason) where reason <> 'adjustment';

-- Has an earlier version of this submission (via resubmission_of) been approved?
create or replace function submission_earned_before(p_changes jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive chain (id, depth) as (
    select case when p_changes ->> 'resubmission_of' ~* '^[0-9a-f-]{36}$'
                then (p_changes ->> 'resubmission_of')::uuid end, 1
    union all
    select case when ep.changes ->> 'resubmission_of' ~* '^[0-9a-f-]{36}$'
                then (ep.changes ->> 'resubmission_of')::uuid end, c.depth + 1
    from chain c join edit_proposals ep on ep.id = c.id
    where c.depth < 50
  )
  select exists (
    select 1 from chain c join edit_proposals ep on ep.id = c.id where ep.status = 'approved'
  );
$$;

create or replace function award_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_was text := case when tg_op = 'UPDATE' then old.status::text end;
begin
  if new.status <> 'approved' or v_was = 'approved' then return new; end if;
  if tg_table_name = 'edit_proposals' then
    if new.entity_table = 'production_submission' then
      if submission_earned_before(new.changes) then return new; end if;
      insert into point_events (user_id, amount, reason, ref_id)
      values (new.proposed_by, 10, 'production_approved', new.id) on conflict do nothing;
    else
      insert into point_events (user_id, amount, reason, ref_id)
      values (new.proposed_by, 2, 'edit_approved', new.id) on conflict do nothing;
    end if;
  elsif tg_table_name = 'media' then
    insert into point_events (user_id, amount, reason, ref_id)
    values (new.uploaded_by,
            case when new.kind = 'poster' then 3 else 2 end,
            case when new.kind = 'poster' then 'poster_approved' else 'photo_approved' end,
            new.id)
    on conflict do nothing;
  end if;
  return new;
end $$;
-- Posters sent with a submission are created already approved
create trigger media_points_insert after insert on media
  for each row execute function award_points();

-- Recalculate everyone's points under the new rules (adjustments kept)
delete from point_events where reason <> 'adjustment';
insert into point_events (user_id, amount, reason, ref_id, created_at)
select ep.proposed_by,
       case when ep.entity_table = 'production_submission' then 10 else 2 end,
       case when ep.entity_table = 'production_submission' then 'production_approved' else 'edit_approved' end,
       ep.id, coalesce(ep.reviewed_at, ep.created_at)
from edit_proposals ep
where ep.status = 'approved'
  and not (ep.entity_table = 'production_submission' and submission_earned_before(ep.changes));
insert into point_events (user_id, amount, reason, ref_id, created_at)
select m.uploaded_by,
       case when m.kind = 'poster' then 3 else 2 end,
       case when m.kind = 'poster' then 'poster_approved' else 'photo_approved' end,
       m.id, coalesce(m.reviewed_at, m.created_at)
from media m
where m.status = 'approved';

-- ---------------------------------------------------------------------
-- Site settings (the founding-member switch)
-- ---------------------------------------------------------------------
create table site_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles (id) on delete set null
);
alter table site_settings enable row level security;
create policy "settings readable by all" on site_settings for select using (true);
-- While open, every account is a founding member; closing records when
insert into site_settings (key, value) values ('founding', '{"open": true, "closed_at": null}');

-- ---------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------
alter table profiles add column show_seen boolean not null default false;
grant update (show_seen) on profiles to authenticated;

create table user_badges (
  user_id    uuid not null references profiles (id) on delete cascade,
  badge      text not null,
  earned_at  timestamptz not null default now(),
  seen_at    timestamptz,                 -- the "You reached ..." message was shown
  primary key (user_id, badge)
);
alter table user_badges enable row level security;
create policy "badges readable by all" on user_badges for select using (true);

-- Contributor levels and the points each needs
create or replace function level_thresholds() returns table (badge text, points int)
language sql immutable as $$
  values ('bronze-1', 10), ('bronze-2', 25), ('bronze-3', 50),
         ('silver-1', 100), ('silver-2', 150), ('silver-3', 225),
         ('gold-1', 300), ('gold-2', 400), ('gold-3', 550),
         ('platinum-1', 750), ('platinum-2', 1000), ('platinum-3', 1300),
         ('diamond', 2000);
$$;

-- Record any badge the member now qualifies for (badges are never taken
-- away once earned)
create or replace function refresh_badges(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles;
  v_points int;
  v_seen int;
  v_photos int;
  v_founding jsonb;
  v_badges text[] := '{}';
begin
  select * into v_profile from profiles where id = p_user;
  if not found then return; end if;
  select coalesce(sum(amount), 0) into v_points from point_events where user_id = p_user;
  select count(*) into v_seen from watch_list where user_id = p_user and status = 'seen';
  select count(*) into v_photos from media where uploaded_by = p_user and kind = 'production_photo' and status = 'approved';
  select value into v_founding from site_settings where key = 'founding';

  v_badges := array(select t.badge from level_thresholds() t where v_points >= t.points);
  if v_profile.role >= 'moderator' then v_badges := v_badges || 'moderator'::text; end if;
  if exists (select 1 from people where verified_owner_id = p_user) then v_badges := v_badges || 'verified'::text; end if;
  if coalesce((v_founding ->> 'open')::boolean, false)
     or v_profile.created_at < (v_founding ->> 'closed_at')::timestamptz then
    v_badges := v_badges || 'founding'::text;
  end if;
  v_badges := v_badges || array(select 'seen-' || n from unnest(array[10, 25, 50, 100, 250]) n where v_seen >= n);
  v_badges := v_badges || array(select 'photos-' || n from unnest(array[10, 50]) n where v_photos >= n);

  insert into user_badges (user_id, badge)
  select p_user, unnest(v_badges)
  on conflict do nothing;
end $$;

create or replace function refresh_badges_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'point_events' then perform refresh_badges(new.user_id);
  elsif tg_table_name = 'watch_list' then perform refresh_badges(coalesce(new.user_id, old.user_id));
  elsif tg_table_name = 'profiles' then perform refresh_badges(new.id);
  elsif tg_table_name = 'people' and new.verified_owner_id is not null then perform refresh_badges(new.verified_owner_id);
  end if;
  return coalesce(new, old);
end $$;
create trigger point_events_badges after insert on point_events
  for each row execute function refresh_badges_trigger();
create trigger watch_list_badges after insert or update on watch_list
  for each row execute function refresh_badges_trigger();
create trigger profiles_badges after insert or update of role on profiles
  for each row execute function refresh_badges_trigger();
create trigger people_badges after update of verified_owner_id on people
  for each row execute function refresh_badges_trigger();

-- Everyone's current badges count as already announced
select refresh_badges(id) from profiles;
update user_badges set seen_at = now() where seen_at is null;

-- "You reached ..." was shown; don't show it again
create or replace function mark_badges_seen() returns void
language sql security definer set search_path = public as $$
  update user_badges set seen_at = now() where user_id = auth.uid() and seen_at is null;
$$;

-- The admin ends (or reopens) the founding-member period
create or replace function set_founding_open(p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('admin') then raise exception 'Only the admin can change this'; end if;
  update site_settings
     set value = jsonb_build_object('open', p_open, 'closed_at', case when p_open then null else now() end),
         updated_at = now(), updated_by = auth.uid()
   where key = 'founding';
end $$;

-- ---------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------

-- Shows seen stays private unless the member chooses to share it
create or replace function seen_count(p_person_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
  from people pe
  join profiles pr on pr.id = pe.verified_owner_id and (pr.show_seen or pr.id = auth.uid())
  join watch_list w on w.user_id = pe.verified_owner_id and w.status = 'seen'
  where pe.id = p_person_id;
$$;

create or replace function profile_stats(p_user uuid)
returns table (points int, contributions int, photos int, seen int)
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(amount) from point_events where user_id = p_user), 0)::int,
         ((select count(*) from edit_proposals where proposed_by = p_user and status = 'approved')
          + (select count(*) from media where uploaded_by = p_user and status = 'approved'))::int,
         (select count(*) from media where uploaded_by = p_user and kind = 'production_photo' and status = 'approved')::int,
         case when exists (select 1 from profiles where id = p_user and (show_seen or id = auth.uid()))
              then (select count(*) from watch_list where user_id = p_user and status = 'seen')::int end;
$$;

-- The shows a member has seen, when they share it (or it's their own)
create or replace function profile_seen(p_user uuid)
returns table (production_id uuid, seen_on timestamptz)
language sql stable security definer set search_path = public as $$
  select w.production_id, w.updated_at
  from watch_list w
  join profiles pr on pr.id = w.user_id and (pr.show_seen or pr.id = auth.uid())
  where w.user_id = p_user and w.status = 'seen'
  order by w.updated_at desc;
$$;

-- Recent approved contributions with what they earned
create or replace function recent_contributions(p_user uuid, p_limit int default 10)
returns table (amount int, reason text, earned_at timestamptz, kind text, entity_table text, entity_id uuid,
               media_kind text, production_id uuid, person_id uuid, credits int, draft_title text)
language sql stable security definer set search_path = public as $$
  select pe.amount, pe.reason, pe.created_at,
         case when ep.id is not null then 'proposal' when m.id is not null then 'media' else 'adjustment' end,
         ep.entity_table, ep.entity_id, m.kind::text, m.production_id, m.person_id,
         coalesce(jsonb_array_length(coalesce(ep.approved_changes, ep.changes) -> 'credits'), 0),
         coalesce(ep.changes -> 'production' ->> 'display_title', '')
  from point_events pe
  left join edit_proposals ep on ep.id = pe.ref_id and pe.reason in ('production_approved', 'edit_approved')
  left join media m on m.id = pe.ref_id and pe.reason in ('poster_approved', 'photo_approved')
  where pe.user_id = p_user
  order by pe.created_at desc
  limit least(p_limit, 50);
$$;

-- ---------------------------------------------------------------------
-- Hotlist
-- ---------------------------------------------------------------------

-- Visitor hashes are 64 hex characters (a daily SHA-256 made in the browser)
create or replace function record_view(p_table text, p_id uuid, p_visitor_hash text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_table not in ('people', 'productions', 'shows') or coalesce(p_visitor_hash, '') !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  insert into page_views (entity_table, entity_id, visitor_hash)
  values (p_table, p_id, p_visitor_hash)
  on conflict do nothing;
end $$;

create table hotlist_snapshots (
  day           date not null,
  entity_table  text not null,
  entity_id     uuid not null,
  rank          int not null,
  primary key (day, entity_table, entity_id)
);
alter table hotlist_snapshots enable row level security;   -- read through hotlist()

create or replace function snapshot_hotlist() returns void
language sql security definer set search_path = public as $$
  insert into hotlist_snapshots (day, entity_table, entity_id, rank)
  select current_date, entity_table, entity_id, rank
  from (select entity_table, entity_id,
               row_number() over (partition by entity_table order by unique_visitors desc, entity_id)::int rank
        from hotlist_7d) r
  where rank <= 100
  on conflict do nothing;
  delete from hotlist_snapshots where day < current_date - 35;
$$;

-- Top pages this week, hidden pages left out, with last week's rank when
-- a snapshot from a week ago exists
create or replace function hotlist(p_table text, p_limit int default 25)
returns table (entity_id uuid, visitors int, rank int, last_week_rank int, has_history boolean)
language sql stable security definer set search_path = public as $$
  with ranked as (
    select h.entity_id, h.unique_visitors,
           row_number() over (order by h.unique_visitors desc, h.entity_id)::int rank
    from hotlist_7d h
    where h.entity_table = p_table
      and (p_table <> 'people' or exists (select 1 from people pe where pe.id = h.entity_id and not pe.is_hidden))
      and (p_table <> 'productions' or exists (select 1 from productions pr where pr.id = h.entity_id and not pr.is_hidden))
  ),
  history as (select exists (select 1 from hotlist_snapshots where day = current_date - 7 and entity_table = p_table) h)
  select r.entity_id, r.unique_visitors, r.rank, s.rank, (select h from history)
  from ranked r
  left join hotlist_snapshots s on s.day = current_date - 7 and s.entity_table = p_table and s.entity_id = r.entity_id
  where r.rank <= least(p_limit, 100)
  order by r.rank;
$$;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('hotlist-refresh', '0 * * * *', 'refresh materialized view concurrently public.hotlist_7d');
select cron.schedule('hotlist-snapshot', '5 0 * * *', 'select public.snapshot_hotlist()');
select cron.schedule('trim-page-views', '15 3 * * *', 'delete from public.page_views where day < current_date - 30');
refresh materialized view hotlist_7d;

-- ---------------------------------------------------------------------
-- Awards
-- ---------------------------------------------------------------------
insert into award_bodies (slug, name, website_url)
values ('emact', 'EMACT', 'https://www.emact.org')
on conflict (slug) do nothing;

-- The same award can't be entered twice
create unique index award_entries_once on award_entries
  (category_id, award_year, production_id, coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Internal: turn an approved award proposal into an entry
create or replace function apply_award(p_proposal_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prop edit_proposals;
  c jsonb;
  v_body uuid;
  v_category uuid;
  v_slug text;
  n int := 1;
begin
  select * into v_prop from edit_proposals where id = p_proposal_id;
  c := v_prop.changes;

  if nullif(c ->> 'body_id', '') is not null then
    v_body := (c ->> 'body_id')::uuid;
  else
    v_slug := slugify(c ->> 'new_body');
    while exists (select 1 from award_bodies where slug = v_slug) loop
      n := n + 1;
      v_slug := slugify(c ->> 'new_body') || '-' || n;
    end loop;
    insert into award_bodies (slug, name) values (v_slug, trim(c ->> 'new_body')) returning id into v_body;
  end if;

  if nullif(c ->> 'category_id', '') is not null then
    v_category := (c ->> 'category_id')::uuid;
  else
    insert into award_categories (award_body_id, name) values (v_body, trim(c ->> 'new_category'))
    on conflict (award_body_id, name) do nothing;
    select id into v_category from award_categories where award_body_id = v_body and name = trim(c ->> 'new_category');
  end if;

  insert into award_entries (category_id, award_year, production_id, person_id, credit_id, result, created_by)
  values (v_category, (c ->> 'year')::smallint, (c ->> 'production_id')::uuid,
          nullif(c ->> 'person_id', '')::uuid, nullif(c ->> 'credit_id', '')::uuid,
          (c ->> 'result')::award_result, v_prop.proposed_by)
  on conflict do nothing;
end $$;

-- Trusted editors and moderators enter awards; moderators' entries publish
-- at once. Returns 'published' or 'pending'.
create or replace function submit_award(p_award jsonb, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_credit credits;
begin
  if not has_role('trusted') then raise exception 'Only trusted editors and moderators can add awards'; end if;
  if nullif(p_award ->> 'body_id', '') is null and nullif(trim(p_award ->> 'new_body'), '') is null then
    raise exception 'Choose the awards';
  end if;
  if nullif(p_award ->> 'body_id', '') is not null and not exists (select 1 from award_bodies where id = (p_award ->> 'body_id')::uuid) then
    raise exception 'Those awards no longer exist';
  end if;
  if coalesce(p_award ->> 'year', '') !~ '^\d{4}$' then raise exception 'Enter the award year'; end if;
  if nullif(p_award ->> 'category_id', '') is null and nullif(trim(p_award ->> 'new_category'), '') is null then
    raise exception 'Choose or add the category';
  end if;
  if nullif(p_award ->> 'category_id', '') is not null and not exists (
    select 1 from award_categories where id = (p_award ->> 'category_id')::uuid
      and (nullif(p_award ->> 'body_id', '') is null or award_body_id = (p_award ->> 'body_id')::uuid)
  ) then
    raise exception 'That category belongs to different awards';
  end if;
  if not exists (select 1 from productions where id = nullif(p_award ->> 'production_id', '')::uuid) then
    raise exception 'Choose the production';
  end if;
  if p_award ->> 'result' not in ('nominated', 'won') then raise exception 'Choose Nominated or Won'; end if;
  if nullif(p_award ->> 'credit_id', '') is not null then
    select * into v_credit from credits where id = (p_award ->> 'credit_id')::uuid;
    if not found or v_credit.production_id <> (p_award ->> 'production_id')::uuid then
      raise exception 'That person isn''t credited in this production';
    end if;
    p_award := p_award || jsonb_build_object('person_id', v_credit.person_id);
  end if;

  insert into edit_proposals (entity_table, entity_id, changes, note, proposed_by)
  values ('award_entries', null, p_award, nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;

  if has_role('moderator') then
    perform apply_award(v_id);
    update edit_proposals set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = v_id;
    return 'published';
  end if;
  return 'pending';
end $$;

create or replace function review_award(p_proposal_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_prop edit_proposals;
begin
  if not has_role('moderator') then raise exception 'Only moderators can review awards'; end if;
  select * into v_prop from edit_proposals where id = p_proposal_id for update;
  if not found or v_prop.entity_table <> 'award_entries' then raise exception 'Award not found'; end if;
  if v_prop.status <> 'pending' then raise exception 'Already reviewed'; end if;
  if p_approve then perform apply_award(p_proposal_id); end if;
  update edit_proposals
     set status = case when p_approve then 'approved' else 'rejected' end::moderation_status,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
   where id = p_proposal_id;
end $$;

-- ---------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------
revoke execute on function refresh_badges(uuid), apply_award(uuid), snapshot_hotlist() from public, anon, authenticated;
revoke execute on function mark_badges_seen(), set_founding_open(boolean), submit_award(jsonb, text),
  review_award(uuid, boolean, text) from public, anon;
grant execute on function mark_badges_seen(), set_founding_open(boolean), submit_award(jsonb, text),
  review_award(uuid, boolean, text) to authenticated;
grant execute on function profile_stats(uuid), profile_seen(uuid), recent_contributions(uuid, int),
  hotlist(text, int), level_thresholds(), seen_count(uuid) to anon, authenticated;
