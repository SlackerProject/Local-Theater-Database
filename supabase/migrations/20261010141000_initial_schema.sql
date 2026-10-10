-- =====================================================================
-- Local Theater Database: initial schema (Supabase / PostgreSQL)
-- Migration 0001
--
-- Layers:
--   1. Core entities   shows, productions, performances, people,
--                      organizations, locations, awards, credits
--   2. Media           photos, headshots, posters (files live in object
--                      storage; the database keeps metadata only)
--   3. Community       profiles, follows, Want to see list, edit
--                      proposals, revision history, contributor points
--   4. Discovery       search indexes, page views, Hotlist
--
-- Conventions:
--   * Every content row has a UUID id and a unique, human-readable slug
--     used in URLs (/production/little-women-walpole-footlighters-2026).
--   * Every change to content is logged to `revisions` by trigger.
--   * Row Level Security is on for every table. Anyone can read public
--     content; members propose edits; trusted editors and moderators
--     write directly.
--   * No one under 18 is represented on the site. People records carry
--     an adult attestation; there is deliberately no birthdate column.
-- =====================================================================

create extension if not exists pg_trgm;
create extension if not exists citext;

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------
create type user_role         as enum ('member', 'trusted', 'moderator', 'admin'); -- order matters: lowest to highest
create type show_type         as enum ('musical', 'play', 'opera', 'revue', 'other');
create type credit_kind       as enum ('cast', 'crew');
create type award_result      as enum ('nominated', 'won');
create type media_kind        as enum ('production_photo', 'poster', 'headshot');
create type moderation_status as enum ('pending', 'approved', 'rejected');
create type watch_status      as enum ('want_to_see', 'going', 'seen');

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================
-- 3a. Profiles (accounts). Created first because content rows point to
--     the account that added them.
-- =====================================================================
create table profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  username          citext not null unique check (username ~ '^[A-Za-z0-9_]{3,30}$'),
  display_name      text   not null check (length(display_name) between 1 and 80),
  role              user_role not null default 'member',
  age_confirmed_at  timestamptz not null,          -- 18+ confirmation at sign-up
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

-- Role check used by RLS policies. Enum comparison follows declaration order.
create or replace function has_role(min_role user_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role >= min_role);
$$;

-- =====================================================================
-- 1. Core entities
-- =====================================================================

-- A theater company, e.g. Walpole Footlighters
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null,
  short_name    text,
  town          text,
  state         char(2) not null default 'MA',
  website_url   text,
  founded_year  smallint check (founded_year between 1800 and 2100),
  description   text,
  is_active     boolean not null default true,
  created_by    uuid references profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- A physical place, e.g. Mass Arts Center
create table locations (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name            text not null,
  street_address  text,
  town            text,
  state           char(2) not null default 'MA',
  postal_code     text,
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  seating_capacity integer check (seating_capacity > 0),
  description     text,
  created_by      uuid references profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Which locations a company regularly uses (many-to-many)
create table organization_locations (
  organization_id uuid not null references organizations (id) on delete cascade,
  location_id     uuid not null references locations (id) on delete cascade,
  is_home_venue   boolean not null default false,
  primary key (organization_id, location_id)
);
create index on organization_locations (location_id);

-- The work itself, e.g. Little Women the Musical
create table shows (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title          text not null,
  subtitle       text,                       -- "The Broadway Musical"
  type           show_type not null,
  authors        text,                       -- "Book by …, Music by …, Lyrics by …"
  synopsis       text,
  premiere_year  smallint check (premiere_year between 1500 and 2100),
  created_by     uuid references profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Canonical roles in a show, so "everyone who has played Laurie" works
create table show_characters (
  id          uuid primary key default gen_random_uuid(),
  show_id     uuid not null references shows (id) on delete cascade,
  name        text not null,
  sort_order  smallint not null default 0,
  unique (show_id, name)
);

-- A person, e.g. a cast or crew member (adults only)
create table people (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name        text not null,
  sort_name           text not null,           -- "Doe, Jane", for alphabetical lists
  bio                 text,
  headshot_media_id   uuid,                    -- FK added after media table
  adult_attested_at   timestamptz not null,    -- contributor confirmed this person is 18+
  adult_attested_by   uuid references profiles (id) on delete set null,
  is_hidden           boolean not null default false,  -- removal / privacy requests
  created_by          uuid references profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- A performer can claim their own profile
alter table profiles add column person_id uuid unique references people (id) on delete set null;

-- A specific staging, e.g. Walpole Footlighters' Little Women (2026)
create table productions (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  show_id          uuid not null references shows (id) on delete restrict,
  organization_id  uuid not null references organizations (id) on delete restrict,
  location_id      uuid references locations (id) on delete set null,   -- primary venue
  year             smallint not null check (year between 1800 and 2100), -- shown in the title
  title_override   text,               -- only when billed differently from the show title
  opening_date     date,
  closing_date     date,
  description      text,
  ticket_url       text,
  poster_media_id  uuid,               -- FK added after media table
  is_hidden        boolean not null default false,
  created_by       uuid references profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (closing_date is null or opening_date is null or closing_date >= opening_date)
);
create index on productions (show_id, year desc);
create index on productions (organization_id, year desc);
create index on productions (location_id, year desc);
create index on productions (opening_date);

-- Display name used everywhere: "Little Women (2026)"
create or replace function production_display_title(p productions) returns text
language sql stable as $$
  select coalesce(p.title_override, s.title) || ' (' || p.year || ')'
  from shows s where s.id = p.show_id;
$$;

-- Individual dates and times, for the "All performances" list
create table performances (
  id             uuid primary key default gen_random_uuid(),
  production_id  uuid not null references productions (id) on delete cascade,
  starts_at      timestamptz not null,
  location_id    uuid references locations (id) on delete set null,  -- only if different from the production's
  label          text,                -- "Opening night", "Matinee", "Closing"
  is_cancelled   boolean not null default false,
  unique (production_id, starts_at)
);
create index on performances (starts_at);

-- Who did what in which production (the join at the heart of the site)
create table credits (
  id              uuid primary key default gen_random_uuid(),
  production_id   uuid not null references productions (id) on delete cascade,
  person_id       uuid not null references people (id) on delete cascade,
  kind            credit_kind not null,
  character_id    uuid references show_characters (id) on delete set null, -- cast: canonical role
  role_name       text,               -- cast: "Ensemble"; crew: "Director", "Music Director"
  billing_order   smallint not null default 0,
  is_understudy   boolean not null default false,
  created_by      uuid references profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (character_id is not null or role_name is not null)
);
create index on credits (person_id);
create index on credits (production_id, kind, billing_order);
create index on credits (character_id);

-- A cast credit's character must belong to the production's show
create or replace function check_credit_character() returns trigger
language plpgsql as $$
begin
  if new.character_id is not null and not exists (
    select 1
    from show_characters sc
    join productions p on p.show_id = sc.show_id
    where sc.id = new.character_id and p.id = new.production_id
  ) then
    raise exception 'Character % does not belong to the show of production %',
      new.character_id, new.production_id;
  end if;
  return new;
end $$;
create trigger credits_character_check before insert or update on credits
  for each row execute function check_credit_character();

-- Awards, e.g. EMACT
create table award_bodies (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null,
  website_url  text
);

create table award_categories (
  id             uuid primary key default gen_random_uuid(),
  award_body_id  uuid not null references award_bodies (id) on delete cascade,
  name           text not null,
  unique (award_body_id, name)
);

-- One nomination or win. Always tied to a production; optionally to a
-- person and the specific credit being honored.
create table award_entries (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references award_categories (id) on delete restrict,
  award_year     smallint not null check (award_year between 1900 and 2100),
  production_id  uuid not null references productions (id) on delete cascade,
  person_id      uuid references people (id) on delete cascade,
  credit_id      uuid references credits (id) on delete set null,
  result         award_result not null,
  created_by     uuid references profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on award_entries (production_id);
create index on award_entries (person_id);
create index on award_entries (category_id, award_year desc);

-- =====================================================================
-- 2. Media (metadata only; image files live in object storage)
-- =====================================================================
create table media (
  id                   uuid primary key default gen_random_uuid(),
  kind                 media_kind not null,
  storage_key          text not null unique,     -- path in the storage bucket
  width                integer check (width > 0),
  height               integer check (height > 0),
  bytes                integer check (bytes > 0),
  production_id        uuid references productions (id) on delete cascade,
  person_id            uuid references people (id) on delete cascade,
  caption              text,
  photographer_credit  text,
  uploaded_by          uuid not null references profiles (id) on delete cascade,
  rights_confirmed_at  timestamptz not null,     -- "I took this or have permission; no one pictured is under 18"
  status               moderation_status not null default 'pending',
  reviewed_by          uuid references profiles (id) on delete set null,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  check (
    (kind = 'headshot' and person_id is not null and production_id is null) or
    (kind in ('production_photo', 'poster') and production_id is not null and person_id is null)
  )
);
create index on media (production_id, created_at desc) where status = 'approved';
create index on media (person_id) where status = 'approved';
create index on media (status, created_at) where status = 'pending';

alter table people
  add constraint people_headshot_fk foreign key (headshot_media_id) references media (id) on delete set null;
alter table productions
  add constraint productions_poster_fk foreign key (poster_media_id) references media (id) on delete set null;

-- =====================================================================
-- 3b. Community
-- =====================================================================

-- Follow a person or a company (not locations, by design)
create table follows (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles (id) on delete cascade,
  person_id        uuid references people (id) on delete cascade,
  organization_id  uuid references organizations (id) on delete cascade,
  created_at       timestamptz not null default now(),
  check (num_nonnulls(person_id, organization_id) = 1)
);
create unique index on follows (user_id, person_id) where person_id is not null;
create unique index on follows (user_id, organization_id) where organization_id is not null;
create index on follows (person_id);
create index on follows (organization_id);

-- Want to see -> Going (a chosen performance) -> Seen
create table watch_list (
  user_id         uuid not null references profiles (id) on delete cascade,
  production_id   uuid not null references productions (id) on delete cascade,
  status          watch_status not null,
  performance_id  uuid references performances (id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (user_id, production_id),
  check (performance_id is null or status in ('going', 'seen'))
);
create index on watch_list (production_id, status);

-- Suggested edits from members, reviewed by trusted editors or moderators
create table edit_proposals (
  id            uuid primary key default gen_random_uuid(),
  entity_table  text not null check (entity_table in (
                  'organizations', 'locations', 'shows', 'show_characters', 'people',
                  'productions', 'performances', 'credits', 'award_entries')),
  entity_id     uuid,                      -- null = proposing a new record
  changes       jsonb not null,            -- field -> proposed value
  note          text,                      -- "Opening night was the 9th, not the 8th"
  proposed_by   uuid not null references profiles (id) on delete cascade,
  status        moderation_status not null default 'pending',
  reviewed_by   uuid references profiles (id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now()
);
create index on edit_proposals (status, created_at) where status = 'pending';
create index on edit_proposals (entity_table, entity_id);
create index on edit_proposals (proposed_by);

-- Full history of every change to content, written only by trigger
create table revisions (
  id            bigint generated always as identity primary key,
  entity_table  text not null,
  entity_id     uuid not null,
  action        text not null check (action in ('insert', 'update', 'delete')),
  before        jsonb,
  after         jsonb,
  changed_by    uuid,
  changed_at    timestamptz not null default now()
);
create index on revisions (entity_table, entity_id, changed_at desc);
create index on revisions (changed_by, changed_at desc);

create or replace function log_revision() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if tg_op = 'DELETE' then v_id := old.id; else v_id := new.id; end if;
  insert into revisions (entity_table, entity_id, action, before, after, changed_by)
  values (
    tg_table_name, v_id, lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Attach history and updated_at to every content table
do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'locations', 'shows', 'people',
    'productions', 'credits', 'award_entries'
  ] loop
    execute format('create trigger %I_updated_at before update on %I
                    for each row execute function set_updated_at()', t, t);
  end loop;
  foreach t in array array[
    'organizations', 'locations', 'shows', 'show_characters', 'people',
    'productions', 'performances', 'credits', 'award_entries', 'media'
  ] loop
    execute format('create trigger %I_history after insert or update or delete on %I
                    for each row execute function log_revision()', t, t);
  end loop;
end $$;

-- Contributor points: an append-only ledger, so totals can always be audited
create table point_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references profiles (id) on delete cascade,
  amount      integer not null,
  reason      text not null check (reason in ('edit_approved', 'photo_approved', 'adjustment')),
  ref_id      uuid,
  created_at  timestamptz not null default now()
);
create index on point_events (user_id);

create view user_points with (security_invoker = true) as
  select user_id, sum(amount)::integer as points
  from point_events
  group by user_id;

-- Award points when a moderator approves a contribution.
-- Starting values; tune them any time.
create or replace function award_points() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    if tg_table_name = 'edit_proposals' then
      insert into point_events (user_id, amount, reason, ref_id)
      values (new.proposed_by, 5, 'edit_approved', new.id);
    elsif tg_table_name = 'media' then
      insert into point_events (user_id, amount, reason, ref_id)
      values (new.uploaded_by, 2, 'photo_approved', new.id);
    end if;
  end if;
  return new;
end $$;
create trigger edit_proposals_points after update on edit_proposals
  for each row execute function award_points();
create trigger media_points after update on media
  for each row execute function award_points();

-- =====================================================================
-- 4. Discovery: search and the Hotlist
-- =====================================================================

-- Fuzzy, typo-tolerant name search
create index people_name_trgm        on people        using gin (display_name gin_trgm_ops);
create index shows_title_trgm        on shows         using gin (title gin_trgm_ops);
create index organizations_name_trgm on organizations using gin (name gin_trgm_ops);
create index locations_name_trgm     on locations     using gin (name gin_trgm_ops);

create or replace function search_all(q text, max_results int default 20)
returns table (entity_table text, id uuid, slug text, label text, score real)
language sql stable as $$
  select * from (
    select 'people'::text, p.id, p.slug, p.display_name, word_similarity(q, p.display_name)
      from people p where not p.is_hidden and q <% p.display_name
    union all
    select 'shows', s.id, s.slug, s.title, word_similarity(q, s.title)
      from shows s where q <% s.title
    union all
    select 'organizations', o.id, o.slug, o.name, word_similarity(q, o.name)
      from organizations o where q <% o.name
    union all
    select 'locations', l.id, l.slug, l.name, word_similarity(q, l.name)
      from locations l where q <% l.name
  ) r (entity_table, id, slug, label, score)
  order by score desc
  limit max_results;
$$;

-- One row per visitor per page per day: refreshing doesn't inflate rank.
-- visitor_hash = hash of a rotating salt plus the visitor's id; no raw IPs stored.
create table page_views (
  entity_table  text not null check (entity_table in ('people', 'productions', 'shows')),
  entity_id     uuid not null,
  day           date not null default current_date,
  visitor_hash  text not null,
  primary key (entity_table, entity_id, day, visitor_hash)
);
create index on page_views (day);

-- The only way clients record a view
create or replace function record_view(p_table text, p_id uuid, p_visitor_hash text)
returns void language sql security definer set search_path = public as $$
  insert into page_views (entity_table, entity_id, visitor_hash)
  values (p_table, p_id, p_visitor_hash)
  on conflict do nothing;
$$;

-- Hotlist: unique visitors over a rolling 7 days, refreshed on a schedule
create materialized view hotlist_7d as
  select entity_table, entity_id, count(*)::integer as unique_visitors
  from page_views
  where day > current_date - 7
  group by entity_table, entity_id;
create unique index on hotlist_7d (entity_table, entity_id);
create index on hotlist_7d (entity_table, unique_visitors desc);

-- Schedule with pg_cron once enabled in Supabase:
--   select cron.schedule('hotlist', '0 * * * *',
--     'refresh materialized view concurrently hotlist_7d');
--   select cron.schedule('trim-views', '15 3 * * *',
--     'delete from page_views where day < current_date - 30');

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table profiles               enable row level security;
alter table organizations          enable row level security;
alter table locations              enable row level security;
alter table organization_locations enable row level security;
alter table shows                  enable row level security;
alter table show_characters        enable row level security;
alter table people                 enable row level security;
alter table productions            enable row level security;
alter table performances           enable row level security;
alter table credits                enable row level security;
alter table award_bodies           enable row level security;
alter table award_categories       enable row level security;
alter table award_entries          enable row level security;
alter table media                  enable row level security;
alter table follows                enable row level security;
alter table watch_list             enable row level security;
alter table edit_proposals         enable row level security;
alter table revisions              enable row level security;
alter table point_events           enable row level security;
alter table page_views             enable row level security;   -- no policies: reachable only via record_view()

-- Public content: everyone reads; trusted editors and above write directly.
do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'locations', 'organization_locations', 'shows', 'show_characters',
    'performances', 'credits', 'award_bodies', 'award_categories', 'award_entries'
  ] loop
    execute format('create policy "%1$s readable by all" on %1$I for select using (true)', t);
    execute format('create policy "%1$s writable by trusted" on %1$I for all
                    using (has_role(''trusted'')) with check (has_role(''trusted''))', t);
  end loop;
end $$;

-- Hidden people and productions are visible only to moderators
create policy "people readable" on people for select
  using (not is_hidden or has_role('moderator'));
create policy "people writable by trusted" on people for all
  using (has_role('trusted')) with check (has_role('trusted'));

create policy "productions readable" on productions for select
  using (not is_hidden or has_role('moderator'));
create policy "productions writable by trusted" on productions for all
  using (has_role('trusted')) with check (has_role('trusted'));

-- Profiles: public names; people edit only their own display fields
create policy "profiles readable by all" on profiles for select using (true);
create policy "insert own profile" on profiles for insert
  with check (id = auth.uid() and role = 'member');
create policy "update own profile" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on profiles from authenticated;
grant update (username, display_name) on profiles to authenticated;

-- Media: approved items are public; uploaders see their own pending ones
create policy "media readable" on media for select
  using (status = 'approved' or uploaded_by = auth.uid() or has_role('moderator'));
create policy "media upload" on media for insert to authenticated
  with check (uploaded_by = auth.uid() and status = 'pending');
create policy "media moderate" on media for update
  using (has_role('moderator')) with check (has_role('moderator'));

-- Personal lists belong to their owner
create policy "own follows" on follows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own watch list" on watch_list for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Edit proposals: members submit; authors and reviewers can see them
create policy "propose edits" on edit_proposals for insert to authenticated
  with check (proposed_by = auth.uid() and status = 'pending');
create policy "see proposals" on edit_proposals for select
  using (proposed_by = auth.uid() or has_role('trusted'));
create policy "review proposals" on edit_proposals for update
  using (has_role('trusted')) with check (has_role('trusted'));

-- History is public (transparency, like Wikipedia); written only by trigger
create policy "revisions readable by all" on revisions for select using (true);

-- Points: everyone can see totals, entries are written only by trigger
create policy "points readable by all" on point_events for select using (true);
