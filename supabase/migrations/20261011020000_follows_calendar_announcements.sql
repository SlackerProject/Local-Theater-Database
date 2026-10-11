-- =====================================================================
-- Local Theater Database: migration 0009
-- Following, the calendar, and follower notifications (Milestone 5)
--
-- Adds:
--   * productions.color_edge: the show's ground darkened until it reaches
--     3:1 against white, outlining swatches so light grounds stay visible
--     (DESIGN.md). Filled for existing palettes; apply_poster() sets it.
--   * follower_count(): public follower totals (who follows whom stays
--     private: follows rows are readable only by their owner).
--   * watch_list: a "going" performance must belong to the production.
--   * notifications: kinds 'cast_announcement' (someone you follow was cast)
--     and 'company_announcement' (a company you follow announced a
--     production), sent when a production submission is approved; status
--     'read'; dismiss_notification().
--   * calendar_feeds: a private, resettable subscription link per member;
--     calendar_feed() lists that member's Going performances for any
--     calendar app.
-- Runs after 0008 (20261011010000_claiming_and_notifications.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Swatch edge color
-- ---------------------------------------------------------------------
create or replace function edge_for(p_ground text) returns text
language plpgsql immutable as $$
declare
  r int := ('x' || substr(p_ground, 2, 2))::bit(8)::int;
  g int := ('x' || substr(p_ground, 4, 2))::bit(8)::int;
  b int := ('x' || substr(p_ground, 6, 2))::bit(8)::int;
  f numeric := 0.62;   -- DESIGN.md's examples; darker still if a ground needs it
  lum numeric;
  rgb int[];
begin
  -- Scale all three channels down together (keeps the hue) until the
  -- contrast against white is at least 3:1
  loop
    rgb := array[round(r * f)::int, round(g * f)::int, round(b * f)::int];
    select 0.2126 * c[1] + 0.7152 * c[2] + 0.0722 * c[3] into lum
    from (select array_agg(case when v / 255.0 <= 0.03928 then v / 255.0 / 12.92
                                else power((v / 255.0 + 0.055) / 1.055, 2.4) end order by i) c
          from unnest(rgb) with ordinality t(v, i)) s;
    exit when 1.05 / (lum + 0.05) >= 3 or f <= 0;
    f := f - 0.01;
  end loop;
  return '#' || upper(lpad(to_hex(rgb[1]), 2, '0') || lpad(to_hex(rgb[2]), 2, '0') || lpad(to_hex(rgb[3]), 2, '0'));
end $$;

alter table productions
  add column color_edge text check (color_edge ~ '^#[0-9A-F]{6}$');
update productions set color_edge = edge_for(color_ground) where color_ground is not null;
alter table productions drop constraint productions_palette_complete;
alter table productions add constraint productions_palette_complete check (
  num_nulls(color_ground, color_ground_2, color_ink, color_soft, color_accent, color_edge) in (0, 6));

-- Unchanged from 0007 except color_edge
create or replace function apply_poster(p_production uuid, p_media uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_palette jsonb;
  v_complete boolean;
begin
  select palette into v_palette from media where id = p_media;
  v_complete := v_palette is not null and (
    select bool_and(coalesce(upper(v_palette ->> k) ~ '^#[0-9A-F]{6}$', false))
    from unnest(array['ground', 'ground2', 'ink', 'soft', 'accent']) k);
  update productions
     set poster_media_id = p_media,
         color_ground   = case when v_complete then upper(v_palette ->> 'ground') end,
         color_ground_2 = case when v_complete then upper(v_palette ->> 'ground2') end,
         color_ink      = case when v_complete then upper(v_palette ->> 'ink') end,
         color_soft     = case when v_complete then upper(v_palette ->> 'soft') end,
         color_accent   = case when v_complete then upper(v_palette ->> 'accent') end,
         color_edge     = case when v_complete then edge_for(upper(v_palette ->> 'ground')) end
   where id = p_production;
end $$;

-- Unchanged from 0008 except clearing color_edge with the rest of the palette
create or replace function revert_revision(p_revision_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  r revisions;
  b jsonb;
begin
  select * into r from revisions where id = p_revision_id;
  if not found then raise exception 'Change not found'; end if;
  b := r.before;

  if r.entity_table = 'credits' and r.action = 'insert' then
    delete from credits where id = r.entity_id;
  elsif r.entity_table = 'credits' and r.action = 'update' then
    update credits
       set kind = (b ->> 'kind')::credit_kind,
           character_id = (b ->> 'character_id')::uuid,
           role_name = b ->> 'role_name',
           is_understudy = (b ->> 'is_understudy')::boolean,
           hidden_on_person_page = (b ->> 'hidden_on_person_page')::boolean
     where id = r.entity_id;
  elsif r.entity_table = 'people' and r.action = 'update' then
    update people
       set display_name = b ->> 'display_name',
           sort_name = b ->> 'sort_name',
           bio = b ->> 'bio',
           links = coalesce(b -> 'links', '[]'::jsonb),
           headshot_media_id = (b ->> 'headshot_media_id')::uuid,
           is_hidden = (b ->> 'is_hidden')::boolean
     where id = r.entity_id;
  elsif r.entity_table = 'media' then
    update media set status = 'rejected', review_note = 'Removed after the page owner disputed it'
     where id = r.entity_id;
    update people set headshot_media_id = null where headshot_media_id = r.entity_id;
    update productions
       set poster_media_id = null, color_ground = null, color_ground_2 = null,
           color_ink = null, color_soft = null, color_accent = null, color_edge = null
     where poster_media_id = r.entity_id;
  else
    raise exception 'This kind of change can''t be undone automatically';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Following
-- ---------------------------------------------------------------------
create or replace function follower_count(p_person_id uuid default null, p_organization_id uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from follows
  where (p_person_id is not null and person_id = p_person_id)
     or (p_organization_id is not null and organization_id = p_organization_id);
$$;

-- ---------------------------------------------------------------------
-- Want to see / Going / Seen
-- ---------------------------------------------------------------------
create or replace function check_watch_performance() returns trigger
language plpgsql as $$
begin
  if new.performance_id is not null and not exists (
    select 1 from performances where id = new.performance_id and production_id = new.production_id
  ) then
    raise exception 'That performance belongs to a different production';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger watch_list_check before insert or update on watch_list
  for each row execute function check_watch_performance();

-- ---------------------------------------------------------------------
-- Follower notifications
-- ---------------------------------------------------------------------
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('page_changed', 'cast_announcement', 'company_announcement'));
alter table notifications drop constraint notifications_status_check;
alter table notifications add constraint notifications_status_check
  check (status in ('unread', 'read', 'kept', 'disputed', 'resolved'));
alter table notifications
  add column production_id uuid references productions (id) on delete cascade,
  add column person_id     uuid references people (id) on delete cascade,
  add column credit_id     uuid references credits (id) on delete cascade;
create unique index notifications_one_per_credit
  on notifications (user_id, credit_id) where kind = 'cast_announcement';
create unique index notifications_one_per_company_production
  on notifications (user_id, production_id) where kind = 'company_announcement';

-- When a production submission is approved, tell the followers of everyone
-- credited by that approval, and (for a new production) of the company.
create or replace function notify_followers() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.entity_table <> 'production_submission' or new.entity_id is null
     or new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  -- Credits created in this same transaction (by approve_submission)
  insert into notifications (user_id, kind, production_id, person_id, credit_id)
  select f.user_id, 'cast_announcement', c.production_id, c.person_id, c.id
  from credits c
  join follows f on f.person_id = c.person_id
  join people pe on pe.id = c.person_id
  where c.production_id = new.entity_id
    and c.created_at = now()
    and not pe.is_hidden
    and f.user_id is distinct from pe.verified_owner_id   -- not about yourself
  on conflict do nothing;

  if not (coalesce(new.approved_changes, new.changes) -> 'production' ? 'id') then
    insert into notifications (user_id, kind, production_id)
    select f.user_id, 'company_announcement', p.id
    from productions p
    join follows f on f.organization_id = p.organization_id
    where p.id = new.entity_id
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger edit_proposals_notify_followers after update on edit_proposals
  for each row execute function notify_followers();

create or replace function dismiss_notification(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update notifications set status = 'read'
  where id = p_id and user_id = auth.uid() and kind <> 'page_changed' and status = 'unread';
$$;

-- "Keep all" (0008) now also clears unread announcements
create or replace function keep_all_notifications() returns void
language sql security definer set search_path = public as $$
  update notifications
     set status = case when kind = 'page_changed' then 'kept' else 'read' end
   where user_id = auth.uid() and status = 'unread';
$$;

-- ---------------------------------------------------------------------
-- Calendar subscription link
-- ---------------------------------------------------------------------
create table calendar_feeds (
  user_id     uuid primary key references profiles (id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now()
);
alter table calendar_feeds enable row level security;
create policy "own calendar feed" on calendar_feeds for select to authenticated using (user_id = auth.uid());

-- The member's link token, created on first use; p_reset makes a new one
-- (the old link stops working).
create or replace function my_calendar_feed(p_reset boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not p_reset then
    select token into v_token from calendar_feeds where user_id = auth.uid();
    if v_token is not null then return v_token; end if;
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into calendar_feeds (user_id, token) values (auth.uid(), v_token)
  on conflict (user_id) do update set token = excluded.token, created_at = now();
  return v_token;
end $$;

-- Everything a calendar app needs for one member's Going performances
create or replace function calendar_feed(p_token text)
returns table (performance_id uuid, starts_at timestamptz, label text, production_slug text,
               title text, year smallint, company text, venue text, address text)
language sql stable security definer set search_path = public as $$
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
  order by pf.starts_at;
$$;

-- ---------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------
revoke execute on function edge_for(text) from public, anon;
revoke execute on function dismiss_notification(uuid), my_calendar_feed(boolean) from public, anon;
grant execute on function dismiss_notification(uuid), my_calendar_feed(boolean) to authenticated;
grant execute on function follower_count(uuid, uuid), calendar_feed(text) to anon, authenticated;
