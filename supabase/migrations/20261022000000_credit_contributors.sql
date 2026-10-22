-- =====================================================================
-- Local Theater Database: migration 0039
-- Credit contributors, not the moderator who approved them
--
--   The change log (revisions) recorded whoever was signed in, so an
--   approved submission, correction or upload was logged under the
--   approving moderator: Stats, Recent changes and "X changed your page"
--   notices named the moderator.
--
--   * revisions.approved_by: the moderator who approved a change made for
--     someone else.
--   * When a proposal is approved (or a pending upload approved), every
--     change made in that same transaction (same changed_at) by the
--     moderator is re-credited to the contributor (changed_by), with the
--     moderator as approved_by. Done at commit (deferred), so it catches
--     changes made after the status update too.
--   * Past approvals are re-credited the same way.
--   * moderation_stats(): Top contributors ranked by points earned in the
--     last 30 days (points already went to contributors).
-- Runs after 0038 (20261021010000_performance_venues.sql).
-- =====================================================================

alter table revisions add column approved_by uuid references profiles (id) on delete set null;

-- Re-credit this transaction's changes by the signed-in moderator
create or replace function credit_contributor(p_contributor uuid) returns void
language sql security definer set search_path = public as $$
  update revisions set changed_by = p_contributor, approved_by = auth.uid()
   where changed_at = now() and changed_by = auth.uid() and p_contributor is not null and auth.uid() is distinct from p_contributor;
$$;
revoke execute on function credit_contributor(uuid) from public, anon, authenticated;

create or replace function credit_approved_proposal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform credit_contributor(new.proposed_by);
  return null;
end $$;
create constraint trigger edit_proposals_credit_contributor
  after update on edit_proposals deferrable initially deferred
  for each row when (old.status = 'pending' and new.status <> 'pending' and new.status <> 'rejected')
  execute function credit_approved_proposal();

create or replace function credit_approved_upload() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform credit_contributor(new.uploaded_by);
  return null;
end $$;
create constraint trigger media_credit_contributor
  after update on media deferrable initially deferred
  for each row when (old.status = 'pending' and new.status = 'approved')
  execute function credit_approved_upload();

-- Past approvals
update revisions r set changed_by = e.proposed_by, approved_by = e.reviewed_by
  from edit_proposals e
 where e.status <> 'pending' and e.status <> 'rejected' and e.reviewed_by is not null and e.reviewed_by <> e.proposed_by
   and r.changed_at = e.reviewed_at and r.changed_by = e.reviewed_by;
update revisions r set changed_by = m.uploaded_by, approved_by = m.reviewed_by
  from media m
 where m.status = 'approved' and m.reviewed_by is not null and m.reviewed_by <> m.uploaded_by
   and r.changed_at = m.reviewed_at and r.changed_by = m.reviewed_by;

create or replace function moderation_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v jsonb;
begin
  if not has_role('moderator') then raise exception 'Only moderators can see stats'; end if;

  select jsonb_build_object(
    'members', jsonb_build_object(
      'total',      (select count(*) from profiles),
      'new_7d',     (select count(*) from profiles where created_at > now() - interval '7 days'),
      'new_30d',    (select count(*) from profiles where created_at > now() - interval '30 days'),
      'signed_in_7d',  (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'signed_in_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
      'suspended',  (select count(*) from profiles where banned_at is not null),
      'claimed_pages', (select count(*) from people where verified_owner_id is not null),
      'by_role',    (select jsonb_object_agg(role, n) from (select role::text, count(*) n from profiles group by role) r)
    ),
    'content', jsonb_build_object(
      'productions',          (select count(*) from productions where not is_hidden),
      'productions_upcoming', (select count(*) from productions where not is_hidden and closing_date >= v_today),
      'productions_new_30d',  (select count(*) from productions where created_at > now() - interval '30 days'),
      'people',               (select count(*) from people where not is_hidden),
      'people_new_30d',       (select count(*) from people where created_at > now() - interval '30 days'),
      'companies',            (select count(*) from organizations),
      'companies_new_30d',    (select count(*) from organizations where created_at > now() - interval '30 days'),
      'shows',                (select count(*) from shows),
      'venues',               (select count(*) from locations),
      'credits',              (select count(*) from credits),
      'performances_upcoming',(select count(*) from performances where starts_at >= now() and not is_cancelled),
      'photos',               (select count(*) from media where status = 'approved'),
      'productions_with_poster', (select count(*) from productions where not is_hidden and poster_media_id is not null),
      'auditions_upcoming',   (select count(distinct production_id) from auditions where starts_at >= now()),
      'awards',               (select count(*) from award_entries)
    ),
    'engagement', jsonb_build_object(
      'follows',     (select count(*) from follows),
      'want_to_see', (select count(*) from watch_list where status = 'want_to_see'),
      'going',       (select count(*) from watch_list where status = 'going'),
      'seen',        (select count(*) from watch_list where status = 'seen'),
      'audition_reminders', (select count(*) from audition_follows)
    ),
    'activity', jsonb_build_object(
      'edits_7d',        (select count(*) from revisions where changed_at > now() - interval '7 days'),
      'edits_30d',       (select count(*) from revisions where changed_at > now() - interval '30 days'),
      'contributors_30d',(select count(distinct u) from (
                            select changed_by u from revisions where changed_at > now() - interval '30 days' and changed_by is not null
                            union select proposed_by from edit_proposals where created_at > now() - interval '30 days') x),
      'approved_30d',    (select count(*) from edit_proposals where status = 'approved' and reviewed_at > now() - interval '30 days'),
      'rejected_30d',    (select count(*) from edit_proposals where status = 'rejected' and reviewed_at > now() - interval '30 days'),
      'review_hours',    (select round(extract(epoch from percentile_cont(0.5) within group (order by reviewed_at - created_at)) / 3600, 1)
                            from edit_proposals where reviewed_at > now() - interval '30 days'),
      'waiting',         (select moderation_pending_count()),
      'feedback_open',   (select count(*) from bug_reports where status = 'open')
    ),
    'visitors', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'visitors', vis, 'views', vw) order by d), '[]')
                 from (select g::date d,
                              (select count(distinct visitor_hash) from page_views where day = g::date) vis,
                              (select count(*) from page_views where day = g::date) vw
                       from generate_series(v_today - 13, v_today, interval '1 day') g) t),
    'weekly', (select coalesce(jsonb_agg(jsonb_build_object(
                  'week', w,
                  'members', (select count(*) from profiles where created_at >= w and created_at < w + 7),
                  'productions', (select count(*) from productions where created_at >= w and created_at < w + 7),
                  'people', (select count(*) from people where created_at >= w and created_at < w + 7),
                  'edits', (select count(*) from revisions where changed_at >= w and changed_at < w + 7)) order by w), '[]')
               from (select (date_trunc('week', v_today) - (n * interval '7 days'))::date w from generate_series(0, 11) n) t),
    -- Ranked by points earned (they go to whoever sent the work in)
    'top_contributors', (select coalesce(jsonb_agg(jsonb_build_object('name', pr.display_name, 'username', pr.username, 'points', t.points, 'approved', t.approved) order by t.points desc), '[]')
                         from (select pe.user_id, sum(pe.amount) points,
                                      (select count(*) from edit_proposals e where e.proposed_by = pe.user_id and e.status = 'approved'
                                         and e.reviewed_at > now() - interval '30 days') approved
                               from point_events pe where pe.created_at > now() - interval '30 days'
                               group by pe.user_id order by points desc limit 10) t
                         join profiles pr on pr.id = t.user_id),
    'top_companies', (select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'slug', o.slug, 'productions', t.n) order by t.n desc), '[]')
                      from (select organization_id, count(*) n from productions where not is_hidden
                            group by organization_id order by n desc limit 10) t
                      join organizations o on o.id = t.organization_id),
    'by_year', (select coalesce(jsonb_agg(jsonb_build_object('year', year, 'productions', n) order by year desc), '[]')
                from (select year, count(*) n from productions where not is_hidden group by year order by year desc limit 12) t)
  ) into v;
  return v;
end $$;

revoke execute on function moderation_stats() from public, anon;
grant execute on function moderation_stats() to authenticated;
