-- =====================================================================
-- Local Theater Database: migration 0029
-- Company logos, like headshots for people
--
--   * media.organization_id: a logo belongs to a company.
--   * organizations.logo_media_id: the logo shown everywhere for it.
--   * Anyone signed in can upload one; a moderator approves it
--     (review_media() puts it in place, as with headshots; it earns the
--     same 2 points as a photo or headshot).
-- Runs after 0028 (20261017000000_logo_kind.sql).
-- =====================================================================

alter table media add column organization_id uuid references organizations (id) on delete cascade;
create index on media (organization_id) where status = 'approved';

alter table media drop constraint media_check;
alter table media add constraint media_check check (
  (kind = 'headshot' and person_id is not null and production_id is null and organization_id is null) or
  (kind in ('production_photo', 'poster') and production_id is not null and person_id is null and organization_id is null) or
  (kind = 'logo' and organization_id is not null and person_id is null and production_id is null)
);

alter table organizations
  add column logo_media_id uuid,
  add constraint organizations_logo_fk foreign key (logo_media_id) references media (id) on delete set null;

-- A moderator approves or rejects one upload (as in photos_and_posters,
-- plus logos)
create or replace function review_media(p_media_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_media media;
begin
  if not has_role('moderator') then
    raise exception 'Only moderators can review uploads';
  end if;
  select * into v_media from media where id = p_media_id for update;
  if not found then raise exception 'Upload not found'; end if;
  if v_media.status <> 'pending' then raise exception 'This upload has already been reviewed'; end if;

  update media
     set status = case when p_approve then 'approved' else 'rejected' end::moderation_status,
         review_note = nullif(trim(p_note), ''),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_media_id;

  if p_approve and v_media.kind = 'poster' then
    perform apply_poster(v_media.production_id, v_media.id);
  elsif p_approve and v_media.kind = 'headshot' then
    update people set headshot_media_id = v_media.id where id = v_media.person_id;
  elsif p_approve and v_media.kind = 'logo' then
    update organizations set logo_media_id = v_media.id where id = v_media.organization_id;
  end if;
end $$;
