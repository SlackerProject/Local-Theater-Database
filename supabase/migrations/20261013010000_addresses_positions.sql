-- =====================================================================
-- Local Theater Database: migration 0020
-- Consistent addresses, a crew positions list, moderators write updates
--
-- Adds:
--   * ma_towns: Massachusetts' 351 cities and towns (the site's scope).
--     Companies and venues must use one of them for their city/town
--     (villages such as East Walpole belong to their town, Walpole);
--     state is always MA; ZIP codes are 5 digits; street addresses are
--     tidied. Existing entries are cleaned up first ("Mansfield, MA" ->
--     Mansfield, East Walpole -> Walpole, Devens -> left blank to choose).
--   * crew_positions: the standard creative-team positions, with a rank
--     for the order on production pages (Director first). Moderators can
--     add new ones (from an "Other" position they approve); new ones go
--     to the end of the order.
--   * Updates (posts) can be written and published by moderators, not
--     only the admin.
-- Runs after 0019 (20261013000000_home_and_updates.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cities and towns
-- ---------------------------------------------------------------------
create table ma_towns (name text primary key);
alter table ma_towns enable row level security;
create policy "towns readable by all" on ma_towns for select using (true);

insert into ma_towns (name) values
('Abington'),
  ('Acton'),
  ('Acushnet'),
  ('Adams'),
  ('Agawam'),
  ('Alford'),
  ('Amesbury'),
  ('Amherst'),
  ('Andover'),
  ('Aquinnah'),
  ('Arlington'),
  ('Ashburnham'),
  ('Ashby'),
  ('Ashfield'),
  ('Ashland'),
  ('Athol'),
  ('Attleboro'),
  ('Auburn'),
  ('Avon'),
  ('Ayer'),
  ('Barnstable'),
  ('Barre'),
  ('Becket'),
  ('Bedford'),
  ('Belchertown'),
  ('Bellingham'),
  ('Belmont'),
  ('Berkley'),
  ('Berlin'),
  ('Bernardston'),
  ('Beverly'),
  ('Billerica'),
  ('Blackstone'),
  ('Blandford'),
  ('Bolton'),
  ('Boston'),
  ('Bourne'),
  ('Boxborough'),
  ('Boxford'),
  ('Boylston'),
  ('Braintree'),
  ('Brewster'),
  ('Bridgewater'),
  ('Brimfield'),
  ('Brockton'),
  ('Brookfield'),
  ('Brookline'),
  ('Buckland'),
  ('Burlington'),
  ('Cambridge'),
  ('Canton'),
  ('Carlisle'),
  ('Carver'),
  ('Charlemont'),
  ('Charlton'),
  ('Chatham'),
  ('Chelmsford'),
  ('Chelsea'),
  ('Cheshire'),
  ('Chester'),
  ('Chesterfield'),
  ('Chicopee'),
  ('Chilmark'),
  ('Clarksburg'),
  ('Clinton'),
  ('Cohasset'),
  ('Colrain'),
  ('Concord'),
  ('Conway'),
  ('Cummington'),
  ('Dalton'),
  ('Danvers'),
  ('Dartmouth'),
  ('Dedham'),
  ('Deerfield'),
  ('Dennis'),
  ('Dighton'),
  ('Douglas'),
  ('Dover'),
  ('Dracut'),
  ('Dudley'),
  ('Dunstable'),
  ('Duxbury'),
  ('East Bridgewater'),
  ('East Brookfield'),
  ('East Longmeadow'),
  ('Eastham'),
  ('Easthampton'),
  ('Easton'),
  ('Edgartown'),
  ('Egremont'),
  ('Erving'),
  ('Essex'),
  ('Everett'),
  ('Fairhaven'),
  ('Fall River'),
  ('Falmouth'),
  ('Fitchburg'),
  ('Florida'),
  ('Foxborough'),
  ('Framingham'),
  ('Franklin'),
  ('Freetown'),
  ('Gardner'),
  ('Georgetown'),
  ('Gill'),
  ('Gloucester'),
  ('Goshen'),
  ('Gosnold'),
  ('Grafton'),
  ('Granby'),
  ('Granville'),
  ('Great Barrington'),
  ('Greenfield'),
  ('Groton'),
  ('Groveland'),
  ('Hadley'),
  ('Halifax'),
  ('Hamilton'),
  ('Hampden'),
  ('Hancock'),
  ('Hanover'),
  ('Hanson'),
  ('Hardwick'),
  ('Harvard'),
  ('Harwich'),
  ('Hatfield'),
  ('Haverhill'),
  ('Hawley'),
  ('Heath'),
  ('Hingham'),
  ('Hinsdale'),
  ('Holbrook'),
  ('Holden'),
  ('Holland'),
  ('Holliston'),
  ('Holyoke'),
  ('Hopedale'),
  ('Hopkinton'),
  ('Hubbardston'),
  ('Hudson'),
  ('Hull'),
  ('Huntington'),
  ('Ipswich'),
  ('Kingston'),
  ('Lakeville'),
  ('Lancaster'),
  ('Lanesborough'),
  ('Lawrence'),
  ('Lee'),
  ('Leicester'),
  ('Lenox'),
  ('Leominster'),
  ('Leverett'),
  ('Lexington'),
  ('Leyden'),
  ('Lincoln'),
  ('Littleton'),
  ('Longmeadow'),
  ('Lowell'),
  ('Ludlow'),
  ('Lunenburg'),
  ('Lynn'),
  ('Lynnfield'),
  ('Malden'),
  ('Manchester-by-the-Sea'),
  ('Mansfield'),
  ('Marblehead'),
  ('Marion'),
  ('Marlborough'),
  ('Marshfield'),
  ('Mashpee'),
  ('Mattapoisett'),
  ('Maynard'),
  ('Medfield'),
  ('Medford'),
  ('Medway'),
  ('Melrose'),
  ('Mendon'),
  ('Merrimac'),
  ('Methuen'),
  ('Middleborough'),
  ('Middlefield'),
  ('Middleton'),
  ('Milford'),
  ('Millbury'),
  ('Millis'),
  ('Millville'),
  ('Milton'),
  ('Monroe'),
  ('Monson'),
  ('Montague'),
  ('Monterey'),
  ('Montgomery'),
  ('Mount Washington'),
  ('Nahant'),
  ('Nantucket'),
  ('Natick'),
  ('Needham'),
  ('New Ashford'),
  ('New Bedford'),
  ('New Braintree'),
  ('New Marlborough'),
  ('New Salem'),
  ('Newbury'),
  ('Newburyport'),
  ('Newton'),
  ('Norfolk'),
  ('North Adams'),
  ('North Andover'),
  ('North Attleborough'),
  ('North Brookfield'),
  ('North Reading'),
  ('Northampton'),
  ('Northborough'),
  ('Northbridge'),
  ('Northfield'),
  ('Norton'),
  ('Norwell'),
  ('Norwood'),
  ('Oak Bluffs'),
  ('Oakham'),
  ('Orange'),
  ('Orleans'),
  ('Otis'),
  ('Oxford'),
  ('Palmer'),
  ('Paxton'),
  ('Peabody'),
  ('Pelham'),
  ('Pembroke'),
  ('Pepperell'),
  ('Peru'),
  ('Petersham'),
  ('Phillipston'),
  ('Pittsfield'),
  ('Plainfield'),
  ('Plainville'),
  ('Plymouth'),
  ('Plympton'),
  ('Princeton'),
  ('Provincetown'),
  ('Quincy'),
  ('Randolph'),
  ('Raynham'),
  ('Reading'),
  ('Rehoboth'),
  ('Revere'),
  ('Richmond'),
  ('Rochester'),
  ('Rockland'),
  ('Rockport'),
  ('Rowe'),
  ('Rowley'),
  ('Royalston'),
  ('Russell'),
  ('Rutland'),
  ('Salem'),
  ('Salisbury'),
  ('Sandisfield'),
  ('Sandwich'),
  ('Saugus'),
  ('Savoy'),
  ('Scituate'),
  ('Seekonk'),
  ('Sharon'),
  ('Sheffield'),
  ('Shelburne'),
  ('Sherborn'),
  ('Shirley'),
  ('Shrewsbury'),
  ('Shutesbury'),
  ('Somerset'),
  ('Somerville'),
  ('South Hadley'),
  ('Southampton'),
  ('Southborough'),
  ('Southbridge'),
  ('Southwick'),
  ('Spencer'),
  ('Springfield'),
  ('Sterling'),
  ('Stockbridge'),
  ('Stoneham'),
  ('Stoughton'),
  ('Stow'),
  ('Sturbridge'),
  ('Sudbury'),
  ('Sunderland'),
  ('Sutton'),
  ('Swampscott'),
  ('Swansea'),
  ('Taunton'),
  ('Templeton'),
  ('Tewksbury'),
  ('Tisbury'),
  ('Tolland'),
  ('Topsfield'),
  ('Townsend'),
  ('Truro'),
  ('Tyngsborough'),
  ('Tyringham'),
  ('Upton'),
  ('Uxbridge'),
  ('Wakefield'),
  ('Wales'),
  ('Walpole'),
  ('Waltham'),
  ('Ware'),
  ('Wareham'),
  ('Warren'),
  ('Warwick'),
  ('Washington'),
  ('Watertown'),
  ('Wayland'),
  ('Webster'),
  ('Wellesley'),
  ('Wellfleet'),
  ('Wendell'),
  ('Wenham'),
  ('West Boylston'),
  ('West Bridgewater'),
  ('West Brookfield'),
  ('West Newbury'),
  ('West Springfield'),
  ('West Stockbridge'),
  ('West Tisbury'),
  ('Westborough'),
  ('Westfield'),
  ('Westford'),
  ('Westhampton'),
  ('Westminster'),
  ('Weston'),
  ('Westport'),
  ('Westwood'),
  ('Weymouth'),
  ('Whately'),
  ('Whitman'),
  ('Wilbraham'),
  ('Williamsburg'),
  ('Williamstown'),
  ('Wilmington'),
  ('Winchendon'),
  ('Winchester'),
  ('Windsor'),
  ('Winthrop'),
  ('Woburn'),
  ('Worcester'),
  ('Worthington'),
  ('Wrentham'),
  ('Yarmouth');

-- "mansfield", "Mansfield, MA" and "Mansfield, Massachusetts" -> Mansfield
create or replace function ma_town(p_town text) returns text
language sql stable set search_path = public as $$
  select name from ma_towns
  where lower(name) = lower(regexp_replace(trim(coalesce(p_town, '')), '\s*,\s*(MA|Mass\.?|Massachusetts)\.?$', '', 'i'));
$$;

-- Clean up what's there now
update organizations set town = ma_town(town) where town is not null and ma_town(town) is not null and town <> ma_town(town);
update locations set town = ma_town(town) where town is not null and ma_town(town) is not null and town <> ma_town(town);
update organizations set town = 'Walpole' where town = 'East Walpole';
update locations set town = 'Walpole' where town = 'East Walpole';
update organizations set town = null where town is not null and ma_town(town) is null;
update locations set town = null where town is not null and ma_town(town) is null;
update locations set postal_code = null where postal_code is not null and trim(postal_code) !~ '^\d{5}(-\d{4})?$';

-- Every company and venue address in the same shape
create or replace function tidy_address() returns trigger
language plpgsql as $$
declare
  v_town text;
begin
  if nullif(trim(coalesce(new.town, '')), '') is null then
    new.town := null;
  else
    v_town := ma_town(new.town);
    if v_town is null then
      raise exception 'Choose the city or town from the Massachusetts list ("%" isn''t one of the 351). Villages like East Walpole belong to their town (Walpole).', trim(new.town);
    end if;
    new.town := v_town;
  end if;
  new.state := 'MA';
  if tg_table_name = 'locations' then
    new.street_address := nullif(regexp_replace(trim(coalesce(new.street_address, '')), '\s+', ' ', 'g'), '');
    new.postal_code := nullif(trim(coalesce(new.postal_code, '')), '');
    if new.postal_code is not null and new.postal_code !~ '^\d{5}(-\d{4})?$' then
      raise exception 'The ZIP code should be 5 digits, like 02081.';
    end if;
  end if;
  return new;
end $$;
create trigger organizations_address before insert or update on organizations
  for each row execute function tidy_address();
create trigger locations_address before insert or update on locations
  for each row execute function tidy_address();

-- ---------------------------------------------------------------------
-- Crew positions
-- ---------------------------------------------------------------------
create table crew_positions (
  name        text primary key check (length(trim(name)) between 2 and 60),
  rank        int not null,              -- order on production pages
  added_by    uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index crew_positions_lower on crew_positions (lower(name));
alter table crew_positions enable row level security;
create policy "positions readable by all" on crew_positions for select using (true);

insert into crew_positions (name, rank)
select name, ord::int from unnest(array[
  'Director', 'Choreographer', 'Music Director', 'Co-Production Manager', 'Stage Manager', 'Asst. Stage Manager',
  'Set Designer', 'Costume Designer', 'Lighting Designer', 'Sound Designer', 'Set Decor', 'Properties', 'Costumer',
  'Build Coordinator', 'Sound Engineer', 'Production Properties Master', 'Technical Consultant',
  'Sound Design and Engineering', 'Hair and Makeup', 'Intimacy Coordinator', 'Sound Operator', 'Lights Operator', 'Dresser'
]) with ordinality t(name, ord);

-- Moderators add positions (approved from "Other"); each goes to the end
create or replace function add_crew_positions(p_names text[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_n int := 0;
begin
  if not has_role('moderator') then raise exception 'Only moderators can add positions'; end if;
  foreach v_name in array coalesce(p_names, '{}') loop
    v_name := regexp_replace(trim(v_name), '\s+', ' ', 'g');
    continue when length(v_name) < 2 or exists (select 1 from crew_positions where lower(name) = lower(v_name));
    insert into crew_positions (name, rank, added_by)
    values (v_name, (select coalesce(max(rank), 0) + 1 from crew_positions), auth.uid());
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Moderators write updates
-- ---------------------------------------------------------------------
alter policy "published posts are public" on posts using (status = 'published' or has_role('moderator'));
alter policy "admins write posts" on posts using (has_role('moderator')) with check (has_role('moderator'));
alter policy "admins write posts" on posts rename to "moderators write posts";

create or replace function save_post(p_id uuid, p_title text, p_summary text, p_body text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_slug text;
  n int := 1;
begin
  if not has_role('moderator') then raise exception 'Only moderators can write updates'; end if;
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

create or replace function publish_post(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_post posts;
  v_n int := 0;
begin
  if not has_role('moderator') then raise exception 'Only moderators can publish updates'; end if;
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
  if not has_role('moderator') then raise exception 'Only moderators can unpublish updates'; end if;
  update posts set status = 'draft' where id = p_id;
  delete from notifications where post_id = p_id and kind = 'site_update' and status = 'unread';
end $$;

revoke execute on function add_crew_positions(text[]) from public, anon;
grant execute on function add_crew_positions(text[]) to authenticated;
grant execute on function ma_town(text) to anon, authenticated;
