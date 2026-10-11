-- =====================================================================
-- Local Theater Database: migration 0019
-- Milestone 7: the home page and site updates
--
-- Adds:
--   * site_counts(): productions, people and companies, for the home
--     page's "and counting" line, shown only when the admin switches the
--     'home_counts' setting on (off by default).
--   * posts: site updates. Admins write them (drafts, publish, unpublish);
--     everyone reads published posts.
--   * publish_post(): publishes and, the first time, sends signed-in
--     members one 'site_update' notification ("New update: {title}"),
--     unless they turned off profiles.notify_updates (on by default).
--   * mark_update_read(): reading the post clears its notification.
-- Runs after 0018 (20261012040000_bug_reports.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Home page numbers
-- ---------------------------------------------------------------------
insert into site_settings (key, value) values ('home_counts', '{"show": false}') on conflict (key) do nothing;

create or replace function site_counts() returns table (productions int, people int, companies int)
language sql stable security definer set search_path = public as $$
  select (select count(*) from productions where not is_hidden)::int,
         (select count(*) from people where not is_hidden)::int,
         (select count(*) from organizations)::int;
$$;

create or replace function set_home_counts(p_show boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('admin') then raise exception 'Only the admin can change this'; end if;
  update site_settings set value = jsonb_build_object('show', p_show), updated_at = now(), updated_by = auth.uid()
   where key = 'home_counts';
end $$;

-- ---------------------------------------------------------------------
-- Update notifications setting
-- ---------------------------------------------------------------------
alter table profiles add column notify_updates boolean not null default true;
grant update (notify_updates) on profiles to authenticated;

-- ---------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------
create table posts (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title         text not null check (length(title) between 1 and 160),
  summary       text not null default '' check (length(summary) <= 300),
  body          text not null default '' check (length(body) <= 50000),
  status        text not null default 'draft' check (status in ('draft', 'published')),
  published_at  timestamptz,                -- first published; the date shown
  notified_at   timestamptz,                -- members told (only ever once)
  created_by    uuid references profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on posts (status, published_at desc);
create trigger posts_updated_at before update on posts for each row execute function set_updated_at();

alter table posts enable row level security;
create policy "published posts are public" on posts for select using (status = 'published' or has_role('admin'));
create policy "admins write posts" on posts for all using (has_role('admin')) with check (has_role('admin'));

-- Notifications for posts
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('page_changed', 'cast_announcement', 'company_announcement', 'auditions_announced', 'site_update'));
alter table notifications add column post_id uuid references posts (id) on delete cascade;
create unique index notifications_one_per_post on notifications (user_id, post_id) where kind = 'site_update';

-- Admin: save a post (new when p_id is null). Returns the post's slug.
create or replace function save_post(p_id uuid, p_title text, p_summary text, p_body text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_slug text;
  n int := 1;
begin
  if not has_role('admin') then raise exception 'Only the admin can write updates'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'The update needs a title'; end if;
  if p_id is null then
    v_slug := slugify(p_title);
    while exists (select 1 from posts where slug = v_slug) loop
      n := n + 1;
      v_slug := slugify(p_title) || '-' || n;
    end loop;
    insert into posts (slug, title, summary, body, created_by)
    values (v_slug, trim(p_title), trim(coalesce(p_summary, '')), coalesce(p_body, ''), auth.uid());
  else
    update posts set title = trim(p_title), summary = trim(coalesce(p_summary, '')), body = coalesce(p_body, '')
     where id = p_id
    returning slug into v_slug;
    if v_slug is null then raise exception 'Update not found'; end if;
  end if;
  return v_slug;
end $$;

-- Admin: publish, telling members the first time
create or replace function publish_post(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_post posts;
  v_n int := 0;
begin
  if not has_role('admin') then raise exception 'Only the admin can publish updates'; end if;
  update posts set status = 'published', published_at = coalesce(published_at, now())
   where id = p_id returning * into v_post;
  if not found then raise exception 'Update not found'; end if;
  if v_post.notified_at is null then
    insert into notifications (user_id, kind, post_id)
    select p.id, 'site_update', v_post.id
    from profiles p
    where p.notify_updates and p.banned_at is null and p.id <> auth.uid()
    on conflict do nothing;
    get diagnostics v_n = row_count;
    update posts set notified_at = now() where id = p_id;
  end if;
  return v_n;
end $$;

create or replace function unpublish_post(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('admin') then raise exception 'Only the admin can unpublish updates'; end if;
  update posts set status = 'draft' where id = p_id;
  -- Unread "New update" notifications for it go away
  delete from notifications where post_id = p_id and kind = 'site_update' and status = 'unread';
end $$;

-- Reading the post clears its notification
create or replace function mark_update_read(p_post_id uuid) returns void
language sql security definer set search_path = public as $$
  update notifications set status = 'read'
   where user_id = auth.uid() and post_id = p_post_id and kind = 'site_update' and status = 'unread';
$$;

-- ---------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------
revoke execute on function set_home_counts(boolean), save_post(uuid, text, text, text), publish_post(uuid),
  unpublish_post(uuid), mark_update_read(uuid) from public, anon;
grant execute on function set_home_counts(boolean), save_post(uuid, text, text, text), publish_post(uuid),
  unpublish_post(uuid), mark_update_read(uuid) to authenticated;
grant execute on function site_counts() to anon, authenticated;
