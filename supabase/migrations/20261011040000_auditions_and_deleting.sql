-- =====================================================================
-- Local Theater Database: migration 0011
-- Auditions, and moderators deleting pages
--
-- Adds:
--   * auditions: audition sessions for a production, plus a general note
--     and sign-up link on the production. A production with no cast yet is
--     "now casting"; until dates are added its auditions read "TBD".
--   * submit_auditions(): any member proposes the full set of audition
--     details. Trusted editors and moderators publish at once; members'
--     proposals wait for a moderator (review_auditions()).
--   * audition_follows: "Remind me about auditions". Followers (and the
--     company's followers) get an 'auditions_announced' notification when
--     dates are published, and followed sessions join the calendar feed.
--   * moderator_delete(): permanently deletes a production, person,
--     company, show or venue, keeping a snapshot in `deletions`. Companies,
--     shows and venues still in use by productions can't be deleted.
--     Deleting a production can also remove what only it used.
-- Runs after 0010 (20261011030000_keep_all_page_changes_only.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Auditions
-- ---------------------------------------------------------------------
alter table productions
  add column audition_note text check (length(audition_note) <= 2000),
  add column audition_url  text check (audition_url ~* '^https?://');

create table auditions (
  id             uuid primary key default gen_random_uuid(),
  production_id  uuid not null references productions (id) on delete cascade,
  starts_at      timestamptz not null,
  ends_at        timestamptz,
  place          text check (length(place) <= 200),   -- "Mass Arts Center" or "Video submissions"
  created_by     uuid references profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index on auditions (production_id, starts_at);
create index on auditions (starts_at);
alter table auditions enable row level security;
create policy "auditions are public" on auditions for select using (true);

create table audition_follows (
  user_id        uuid not null references profiles (id) on delete cascade,
  production_id  uuid not null references productions (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, production_id)
);
create index on audition_follows (production_id);
alter table audition_follows enable row level security;
create policy "own audition follows" on audition_follows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table edit_proposals drop constraint edit_proposals_entity_table_check;
alter table edit_proposals add constraint edit_proposals_entity_table_check check (entity_table in (
  'organizations', 'locations', 'shows', 'show_characters', 'people', 'productions', 'performances',
  'credits', 'award_entries', 'production_submission', 'auditions'));

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('page_changed', 'cast_announcement', 'company_announcement', 'auditions_announced'));
-- One unread "audition dates posted" per member and production
create unique index notifications_one_unread_auditions
  on notifications (user_id, production_id) where kind = 'auditions_announced' and status = 'unread';

-- Publish a proposal's audition details: replaces the production's sessions,
-- note and link, then tells audition followers and the company's followers
create or replace function apply_auditions(p_proposal_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prop edit_proposals;
  s jsonb;
  v_day date;
begin
  select * into v_prop from edit_proposals where id = p_proposal_id;
  delete from auditions where production_id = v_prop.entity_id;
  for s in select * from jsonb_array_elements(coalesce(v_prop.changes -> 'sessions', '[]')) loop
    v_day := (s ->> 'date')::date;
    insert into auditions (production_id, starts_at, ends_at, place, created_by)
    values (v_prop.entity_id,
            (v_day + coalesce(nullif(s ->> 'start', ''), '19:00')::time) at time zone 'America/New_York',
            case when nullif(s ->> 'end', '') is not null
                 then (v_day + (s ->> 'end')::time) at time zone 'America/New_York' end,
            nullif(trim(s ->> 'place'), ''),
            v_prop.proposed_by);
  end loop;
  update productions
     set audition_note = nullif(trim(v_prop.changes ->> 'note'), ''),
         audition_url  = nullif(trim(v_prop.changes ->> 'url'), '')
   where id = v_prop.entity_id;

  if jsonb_array_length(coalesce(v_prop.changes -> 'sessions', '[]')) > 0 then
    insert into notifications (user_id, kind, production_id)
    select distinct u, 'auditions_announced', v_prop.entity_id
    from (
      select user_id u from audition_follows where production_id = v_prop.entity_id
      union
      select f.user_id from follows f join productions p on p.organization_id = f.organization_id
      where p.id = v_prop.entity_id
    ) x
    on conflict do nothing;
  end if;
end $$;

-- p_sessions: [{"date":"2026-11-02","start":"19:00","end":"21:00","place":"..."}]
-- Returns 'published' or 'pending'.
create or replace function submit_auditions(p_production_id uuid, p_sessions jsonb, p_note text, p_url text, p_comment text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
  v_id uuid;
  v_sessions jsonb := '[]';
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from productions where id = p_production_id) then raise exception 'Production not found'; end if;
  if jsonb_typeof(coalesce(p_sessions, '[]')) <> 'array' or jsonb_array_length(coalesce(p_sessions, '[]')) > 30 then
    raise exception 'Up to 30 audition sessions';
  end if;
  for s in select * from jsonb_array_elements(coalesce(p_sessions, '[]')) loop
    if coalesce(s ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Each session needs a date'; end if;
    if coalesce(s ->> 'start', '') !~ '^(\d{2}:\d{2})?$' or coalesce(s ->> 'end', '') !~ '^(\d{2}:\d{2})?$' then
      raise exception 'Times look wrong';
    end if;
    if nullif(s ->> 'end', '') is not null and nullif(s ->> 'start', '') is not null and (s ->> 'end') <= (s ->> 'start') then
      raise exception 'An end time is before its start time';
    end if;
    v_sessions := v_sessions || jsonb_build_object(
      'date', s ->> 'date', 'start', coalesce(s ->> 'start', ''), 'end', coalesce(s ->> 'end', ''),
      'place', left(trim(coalesce(s ->> 'place', '')), 200));
  end loop;
  if nullif(trim(p_url), '') is not null and trim(p_url) !~* '^https?://\S+\.\S+' then
    raise exception 'The sign-up link should start with https://';
  end if;

  insert into edit_proposals (entity_table, entity_id, changes, note, proposed_by)
  values ('auditions', p_production_id,
          jsonb_build_object('sessions', v_sessions, 'note', left(trim(coalesce(p_note, '')), 2000), 'url', trim(coalesce(p_url, ''))),
          nullif(trim(p_comment), ''), auth.uid())
  returning id into v_id;

  if has_role('trusted') then
    perform apply_auditions(v_id);
    update edit_proposals set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = v_id;
    return 'published';
  end if;
  return 'pending';
end $$;

create or replace function review_auditions(p_proposal_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_prop edit_proposals;
begin
  if not has_role('moderator') then raise exception 'Only moderators can review audition dates'; end if;
  select * into v_prop from edit_proposals where id = p_proposal_id for update;
  if not found or v_prop.entity_table <> 'auditions' then raise exception 'Proposal not found'; end if;
  if v_prop.status <> 'pending' then raise exception 'Already reviewed'; end if;
  if p_approve then perform apply_auditions(p_proposal_id); end if;
  update edit_proposals
     set status = case when p_approve then 'approved' else 'rejected' end::moderation_status,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
   where id = p_proposal_id;
end $$;

-- ---------------------------------------------------------------------
-- Calendar feed: Going performances plus sessions of auditions you follow
-- (unchanged from 0009 apart from the second half)
-- ---------------------------------------------------------------------
create or replace function calendar_feed(p_token text)
returns table (performance_id uuid, starts_at timestamptz, label text, production_slug text,
               title text, year smallint, company text, venue text, address text)
language sql stable security definer set search_path = public as $$
  select * from (
    select pf.id, pf.starts_at, pf.label, p.slug,
           coalesce(p.title_override, s.title), p.year, o.name, l.name,
           concat_ws(', ', l.street_address, l.town, l.state)
    from calendar_feeds cf
    join watch_list w on w.user_id = cf.user_id and w.status = 'going' and w.performance_id is not null
    join performances pf on pf.id = w.performance_id and not pf.is_cancelled
    join productions p on p.id = w.production_id and not p.is_hidden
    join shows s on s.id = p.show_id
    join organizations o on o.id = p.organization_id
    left join locations l on l.id = coalesce(pf.location_id, p.location_id)
    where cf.token = p_token and length(p_token) >= 32
      and pf.starts_at > now() - interval '60 days'
    union all
    select a.id, a.starts_at, 'Auditions', p.slug,
           'Auditions: ' || coalesce(p.title_override, s.title), p.year, o.name, a.place, null
    from calendar_feeds cf
    join audition_follows af on af.user_id = cf.user_id
    join auditions a on a.production_id = af.production_id
    join productions p on p.id = af.production_id and not p.is_hidden
    join shows s on s.id = p.show_id
    join organizations o on o.id = p.organization_id
    where cf.token = p_token and length(p_token) >= 32
      and a.starts_at > now() - interval '60 days'
  ) x
  order by 2;
$$;

-- ---------------------------------------------------------------------
-- Moderators deleting pages
-- ---------------------------------------------------------------------
create table deletions (
  id            bigint generated always as identity primary key,
  entity_table  text not null,
  entity_id     uuid not null,
  label         text,
  snapshot      jsonb not null,
  deleted_by    uuid references profiles (id) on delete set null,
  deleted_at    timestamptz not null default now()
);
alter table deletions enable row level security;
create policy "moderators read deletions" on deletions for select using (has_role('moderator'));

-- Owners aren't asked to keep or dispute changes that come from a moderator
-- deleting a page (unchanged from 0008 apart from the first check)
create or replace function notify_page_owners() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row     jsonb := coalesce(new.after, new.before);
  v_person  uuid;
  v_prod    uuid;
  v_ignore  text[] := array['verified_owner_id', 'updated_at'];
begin
  if coalesce(current_setting('app.moderator_delete', true), '') = 'on' then
    return new;
  end if;
  if new.entity_table = 'people' then
    if new.action = 'update' and (new.after - v_ignore) = (new.before - v_ignore) then
      return new;
    end if;
    v_person := new.entity_id;
  elsif new.entity_table in ('credits', 'award_entries') then
    v_person := (v_row ->> 'person_id')::uuid;
  elsif new.entity_table = 'media' then
    if not (new.after ->> 'status' = 'approved' and coalesce(new.before ->> 'status', '') <> 'approved') then
      return new;
    end if;
    v_person := (v_row ->> 'person_id')::uuid;
    v_prod   := (v_row ->> 'production_id')::uuid;
  else
    return new;
  end if;

  insert into notifications (user_id, kind, revision_id)
  select distinct pe.verified_owner_id, 'page_changed', new.id
  from people pe
  where pe.verified_owner_id is not null
    and pe.verified_owner_id is distinct from new.changed_by
    and (
      pe.id = v_person
      or (v_prod is not null and pe.id in (select c.person_id from credits c where c.production_id = v_prod))
    );
  return new;
end $$;

-- What deleting a production would leave unused: people credited only
-- there (and not verified), and its show, company and venue if nothing
-- else uses them
create or replace function production_orphans(p_production_id uuid)
returns table (entity_table text, entity_id uuid, label text)
language sql stable security definer set search_path = public as $$
  select 'people', pe.id, pe.display_name
  from people pe
  where pe.id in (select person_id from credits where production_id = p_production_id)
    and pe.verified_owner_id is null
    and not exists (select 1 from credits c where c.person_id = pe.id and c.production_id <> p_production_id)
    and not exists (select 1 from person_claims pc where pc.person_id = pe.id and pc.status = 'pending')
  union all
  select 'shows', s.id, s.title
  from productions p join shows s on s.id = p.show_id
  where p.id = p_production_id and not exists (select 1 from productions o where o.show_id = s.id and o.id <> p.id)
  union all
  select 'organizations', o.id, o.name
  from productions p join organizations o on o.id = p.organization_id
  where p.id = p_production_id and not exists (select 1 from productions x where x.organization_id = o.id and x.id <> p.id)
  union all
  select 'locations', l.id, l.name
  from locations l
  where l.id in (select location_id from productions where id = p_production_id
                 union select location_id from performances where production_id = p_production_id)
    and not exists (select 1 from productions x where x.location_id = l.id and x.id <> p_production_id)
    and not exists (select 1 from performances x where x.location_id = l.id and x.production_id <> p_production_id);
$$;

-- What a page is still used by (shown before deleting, and enforced here)
create or replace function deletion_blockers(p_table text, p_id uuid)
returns table (slug text, label text)
language sql stable security definer set search_path = public as $$
  select p.slug, coalesce(p.title_override, s.title) || ' (' || p.year || ')'
  from productions p join shows s on s.id = p.show_id
  where (p_table = 'shows' and p.show_id = p_id)
     or (p_table = 'organizations' and p.organization_id = p_id)
     or (p_table = 'locations' and (p.location_id = p_id
         or p.id in (select production_id from performances where location_id = p_id)))
  order by p.year desc;
$$;

create or replace function moderator_delete(p_table text, p_id uuid, p_with_orphans boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_label text;
  v_orphans jsonb;
  v_item jsonb;
  v_count int := 1;
  v_outer boolean := coalesce(current_setting('app.moderator_delete', true), '') <> 'on';
begin
  if not has_role('moderator') then raise exception 'Only moderators can delete pages'; end if;
  if p_table not in ('productions', 'people', 'organizations', 'shows', 'locations') then
    raise exception 'That can''t be deleted here';
  end if;
  if exists (select 1 from deletion_blockers(p_table, p_id)) then
    raise exception 'Delete its productions first';
  end if;

  execute format('select to_jsonb(t) from %I t where id = $1', p_table) into v_row using p_id;
  if v_row is null then raise exception 'Already deleted'; end if;
  v_label := coalesce(v_row ->> 'display_name', v_row ->> 'name', v_row ->> 'title', v_row ->> 'slug');

  -- Keep enough to rebuild by hand if a delete was a mistake
  if p_table = 'productions' then
    v_row := v_row || jsonb_build_object(
      'credits', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from credits c where c.production_id = p_id),
      'performances', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from performances x where x.production_id = p_id),
      'auditions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from auditions x where x.production_id = p_id));
  elsif p_table = 'people' then
    v_row := v_row || jsonb_build_object(
      'credits', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from credits c where c.person_id = p_id));
  end if;

  perform set_config('app.moderator_delete', 'on', true);

  if p_table = 'productions' and p_with_orphans then
    select jsonb_agg(to_jsonb(o)) into v_orphans from production_orphans(p_id) o;
  end if;

  insert into deletions (entity_table, entity_id, label, snapshot, deleted_by)
  values (p_table, p_id, v_label, v_row, auth.uid());
  execute format('delete from %I where id = $1', p_table) using p_id;

  -- Then whatever only that production used: people first, then its
  -- show, company and venue
  for v_item in select * from jsonb_array_elements(coalesce(v_orphans, '[]'))
                order by value ->> 'entity_table' = 'people' desc loop
    v_count := v_count + moderator_delete(v_item ->> 'entity_table', (v_item ->> 'entity_id')::uuid, false);
  end loop;

  if v_outer then perform set_config('app.moderator_delete', '', true); end if;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------
revoke execute on function apply_auditions(uuid) from public, anon, authenticated;
revoke execute on function submit_auditions(uuid, jsonb, text, text, text), review_auditions(uuid, boolean, text),
  moderator_delete(text, uuid, boolean), production_orphans(uuid), deletion_blockers(text, uuid) from public, anon;
grant execute on function submit_auditions(uuid, jsonb, text, text, text), review_auditions(uuid, boolean, text),
  moderator_delete(text, uuid, boolean), production_orphans(uuid), deletion_blockers(text, uuid) to authenticated;
