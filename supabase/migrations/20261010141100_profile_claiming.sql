-- =====================================================================
-- Local Theater Database: migration 0002
-- Profile claiming and owner controls
--
-- Adds:
--   * person_claims     "Is this you?" claims, verified by a moderator
--                       or vouched for by a trusted editor
--   * people.verified_owner_id   the account that owns a verified page
--   * people.links      personal website and other links
--   * credits flags     hidden from the owner's page; added by the owner
--   * owner_* functions the only way owners edit their own page directly
--   * notifications     owners hear when anyone else changes their page
--   * frequent_collaborators()   powers the person page sidebar
-- Runs after 0001_initial_schema.sql.
-- =====================================================================

create type claim_status as enum ('pending', 'verified', 'rejected');

-- ---------------------------------------------------------------------
-- People and credits: new columns
-- ---------------------------------------------------------------------
alter table people
  add column verified_owner_id uuid unique references profiles (id) on delete set null,
  add column links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(links) = 'array');

alter table credits
  add column hidden_on_person_page boolean not null default false,  -- owner's choice; still listed on the production
  add column added_by_owner        boolean not null default false;  -- shows "Added by [name]"

-- ---------------------------------------------------------------------
-- Claims
-- ---------------------------------------------------------------------
create table person_claims (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null references people (id) on delete cascade,
  user_id        uuid not null references profiles (id) on delete cascade,
  status         claim_status not null default 'pending',
  evidence_url   text,          -- e.g. personal site or a company cast page naming them
  evidence_note  text,
  vouched_by     uuid references profiles (id) on delete set null,   -- a trusted editor who knows them
  reviewed_by    uuid references profiles (id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);
-- One open or verified claim per page, and one per account
create unique index person_claims_one_active_per_person
  on person_claims (person_id) where status in ('pending', 'verified');
create unique index person_claims_one_active_per_user
  on person_claims (user_id) where status in ('pending', 'verified');
create index on person_claims (status, created_at) where status = 'pending';

-- When a claim is verified, link the account and the page both ways
create or replace function apply_verified_claim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'verified' and old.status is distinct from 'verified' then
    update people   set verified_owner_id = new.user_id where id = new.person_id;
    update profiles set person_id = new.person_id      where id = new.user_id;
    new.reviewed_at := coalesce(new.reviewed_at, now());
  elsif old.status = 'verified' and new.status <> 'verified' then
    update people   set verified_owner_id = null where id = new.person_id and verified_owner_id = new.user_id;
    update profiles set person_id = null         where id = new.user_id and person_id = new.person_id;
  end if;
  return new;
end $$;
create trigger person_claims_apply before update on person_claims
  for each row execute function apply_verified_claim();

alter table person_claims enable row level security;
create policy "submit own claim" on person_claims for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and vouched_by is null and reviewed_by is null);
create policy "see own claims" on person_claims for select
  using (user_id = auth.uid() or has_role('trusted'));
create policy "trusted vouch, moderators decide" on person_claims for update
  using (has_role('trusted'))
  with check (has_role('moderator') or status = 'pending');

-- ---------------------------------------------------------------------
-- Owner controls. Owners edit only through these functions, which check
-- ownership; everything else about a page still goes through review.
-- ---------------------------------------------------------------------
create or replace function my_person_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from people where verified_owner_id = auth.uid();
$$;

-- Bio, links and headshot choice
create or replace function owner_update_person(p_bio text, p_links jsonb, p_headshot_media_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_person uuid := my_person_id();
begin
  if v_person is null then
    raise exception 'This account does not own a verified page';
  end if;
  if p_links is not null and jsonb_typeof(p_links) <> 'array' then
    raise exception 'Links must be a list';
  end if;
  if p_headshot_media_id is not null and not exists (
    select 1 from media
    where id = p_headshot_media_id and person_id = v_person
      and kind = 'headshot' and status = 'approved'
  ) then
    raise exception 'The headshot must be an approved headshot of you';
  end if;
  update people
     set bio = p_bio,
         links = coalesce(p_links, '[]'::jsonb),
         headshot_media_id = p_headshot_media_id
   where id = v_person;
end $$;

-- Add a missing credit to your own history (publishes immediately, labeled)
create or replace function owner_add_credit(
  p_production_id uuid, p_kind credit_kind, p_character_id uuid, p_role_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_person uuid := my_person_id();
  v_id uuid;
begin
  if v_person is null then
    raise exception 'This account does not own a verified page';
  end if;
  insert into credits (production_id, person_id, kind, character_id, role_name, added_by_owner, created_by)
  values (p_production_id, v_person, p_kind, p_character_id, p_role_name, true, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Correct the role on one of your own credits
create or replace function owner_update_credit(p_credit_id uuid, p_character_id uuid, p_role_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update credits
     set character_id = p_character_id, role_name = p_role_name
   where id = p_credit_id and person_id = my_person_id();
  if not found then
    raise exception 'That credit is not on your page';
  end if;
end $$;

-- Hide or show one of your credits on your own page
create or replace function owner_set_credit_hidden(p_credit_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update credits
     set hidden_on_person_page = p_hidden
   where id = p_credit_id and person_id = my_person_id();
  if not found then
    raise exception 'That credit is not on your page';
  end if;
end $$;

-- Hide or restore your whole page
create or replace function owner_set_page_hidden(p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update people set is_hidden = p_hidden where id = my_person_id();
  if not found then
    raise exception 'This account does not own a verified page';
  end if;
end $$;

revoke execute on function
  my_person_id(), owner_update_person(text, jsonb, uuid),
  owner_add_credit(uuid, credit_kind, uuid, text),
  owner_update_credit(uuid, uuid, text),
  owner_set_credit_hidden(uuid, boolean),
  owner_set_page_hidden(boolean)
from public, anon;
grant execute on function
  my_person_id(), owner_update_person(text, jsonb, uuid),
  owner_add_credit(uuid, credit_kind, uuid, text),
  owner_update_credit(uuid, uuid, text),
  owner_set_credit_hidden(uuid, boolean),
  owner_set_page_hidden(boolean)
to authenticated;

-- ---------------------------------------------------------------------
-- Notifications: "1 change to your page" with Keep it / Dispute
-- ---------------------------------------------------------------------
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  kind         text not null check (kind in ('page_changed')),
  revision_id  bigint references revisions (id) on delete cascade,
  status       text not null default 'unread' check (status in ('unread', 'kept', 'disputed')),
  created_at   timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);
create index on notifications (status) where status = 'disputed';   -- moderators' dispute queue

alter table notifications enable row level security;
create policy "own notifications" on notifications for select
  using (user_id = auth.uid() or has_role('moderator'));
create policy "respond to own notifications" on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Whenever someone else changes a verified person's page, their credits,
-- their awards, their headshots, or photos of a production they're in,
-- tell the owner.
create or replace function notify_page_owners() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row     jsonb := coalesce(new.after, new.before);
  v_person  uuid;
  v_prod    uuid;
begin
  if new.entity_table = 'people' then
    v_person := new.entity_id;
  elsif new.entity_table in ('credits', 'award_entries') then
    v_person := (v_row ->> 'person_id')::uuid;
  elsif new.entity_table = 'media' then
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
create trigger revisions_notify after insert on revisions
  for each row execute function notify_page_owners();

-- ---------------------------------------------------------------------
-- Person page sidebar: people you've shared the most productions with
-- ---------------------------------------------------------------------
create or replace function frequent_collaborators(p_person_id uuid, max_results int default 5)
returns table (person_id uuid, display_name text, slug text, shows_together int)
language sql stable as $$
  select other.id, other.display_name, other.slug, count(distinct c2.production_id)::int
  from credits c1
  join credits c2  on c2.production_id = c1.production_id and c2.person_id <> c1.person_id
  join people other on other.id = c2.person_id and not other.is_hidden
  where c1.person_id = p_person_id
  group by other.id, other.display_name, other.slug
  having count(distinct c2.production_id) >= 2
  order by 4 desc, 2
  limit max_results;
$$;
create index if not exists credits_production_person on credits (production_id, person_id);
