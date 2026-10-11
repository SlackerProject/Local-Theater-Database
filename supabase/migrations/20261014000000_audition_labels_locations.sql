-- =====================================================================
-- Local Theater Database: migration 0021
-- Audition sessions get a label and a listed location
--
--   * auditions.label: what the session is ("Dance audition", "Callbacks").
--     Blank reads as "Auditions".
--   * auditions.location_id: "Where" is now one of the site's locations.
--     `place` stays, filled with the location's name, so older code and
--     the calendar feed keep working.
--   * submit_auditions() checks each session's location exists and keeps
--     the label; apply_auditions() stores both.
--   * calendar_feed() shows the label and the location's address.
-- Runs after 0020 (20261013010000_addresses_positions.sql).
-- =====================================================================

alter table auditions
  add column label       text check (length(label) <= 60),
  add column location_id uuid references locations (id) on delete set null;
create index on auditions (location_id);

-- Publish a proposal's audition details (as 0011, plus label and location)
create or replace function apply_auditions(p_proposal_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prop edit_proposals;
  s jsonb;
  v_day date;
  v_loc locations;
begin
  select * into v_prop from edit_proposals where id = p_proposal_id;
  delete from auditions where production_id = v_prop.entity_id;
  for s in select * from jsonb_array_elements(coalesce(v_prop.changes -> 'sessions', '[]')) loop
    v_day := (s ->> 'date')::date;
    v_loc := null;
    if nullif(s ->> 'location_id', '') is not null then
      select * into v_loc from locations where id = (s ->> 'location_id')::uuid;
    end if;
    insert into auditions (production_id, starts_at, ends_at, label, location_id, place, created_by)
    values (v_prop.entity_id,
            (v_day + coalesce(nullif(s ->> 'start', ''), '19:00')::time) at time zone 'America/New_York',
            case when nullif(s ->> 'end', '') is not null
                 then (v_day + (s ->> 'end')::time) at time zone 'America/New_York' end,
            nullif(trim(s ->> 'label'), ''),
            v_loc.id,
            coalesce(v_loc.name, nullif(trim(s ->> 'place'), '')),
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

-- p_sessions: [{"date":"2026-11-02","start":"19:00","end":"21:00",
--               "label":"Callbacks","location_id":"<uuid>"}]
-- "Where" must be one of the site's locations (or left blank).
create or replace function submit_auditions(p_production_id uuid, p_sessions jsonb, p_note text, p_url text, p_comment text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
  v_id uuid;
  v_loc uuid;
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
    if length(trim(coalesce(s ->> 'label', ''))) > 60 then
      raise exception 'Keep each session label under 60 characters';
    end if;
    v_loc := null;
    if nullif(s ->> 'location_id', '') is not null then
      if (s ->> 'location_id') !~ '^[0-9a-f-]{36}$' then raise exception 'Choose a location from the list'; end if;
      select id into v_loc from locations where id = (s ->> 'location_id')::uuid;
      if v_loc is null then raise exception 'Choose a location from the list'; end if;
    end if;
    v_sessions := v_sessions || jsonb_build_object(
      'date', s ->> 'date', 'start', coalesce(s ->> 'start', ''), 'end', coalesce(s ->> 'end', ''),
      'label', regexp_replace(trim(coalesce(s ->> 'label', '')), '\s+', ' ', 'g'),
      'location_id', coalesce(v_loc::text, ''));
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

-- Calendar feed (as 0011; auditions now show their label and address)
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

revoke execute on function apply_auditions(uuid) from public, anon, authenticated;
