-- =====================================================================
-- Local Theater Database: migration 0008
-- Claiming your page (Milestone 4)
--
-- Builds the screens' database side on top of 0002_profile_claiming:
--   * Claims are reviewed only through functions:
--       vouch_claim()   trusted editors: "I know this person" (not their own)
--       review_claim()  moderators verify or reject; nobody verifies their
--                       own claim except an admin
--       claim_state()   anyone: is this page unclaimed, pending or verified?
--   * Owners can see their own page while it's hidden.
--   * owner_add_credit_named(), owner_set_credit_role(): add or correct a
--     credit by role name; cast roles link to the show's characters.
--   * Notifications: owners respond (Keep it / Dispute, with a reason);
--     moderators resolve disputes, optionally undoing the change.
--     Owners are no longer notified about pending uploads (only once one
--     is approved) or about their page being verified.
--   * approve_person_edit(): display-name suggestions go through review.
--   * lookup_productions(): search productions ("Title (Year)").
--   * submission_destination(): where a "Share with your cast" link goes.
-- Runs after 0007 (20261011000000_photos_and_posters.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Claims
-- ---------------------------------------------------------------------
drop policy "trusted vouch, moderators decide" on person_claims;   -- functions only now

create or replace function claim_state(p_person_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from people where id = p_person_id and verified_owner_id is not null) then 'verified'
    when exists (select 1 from person_claims where person_id = p_person_id and status = 'pending') then 'pending'
    else 'none'
  end;
$$;

create or replace function vouch_claim(p_claim_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_claim person_claims;
begin
  if not has_role('trusted') then raise exception 'Only trusted editors can vouch for a claim'; end if;
  select * into v_claim from person_claims where id = p_claim_id for update;
  if not found or v_claim.status <> 'pending' then raise exception 'Claim not found or already reviewed'; end if;
  if v_claim.user_id = auth.uid() then raise exception 'You can''t vouch for your own claim'; end if;
  update person_claims set vouched_by = auth.uid() where id = p_claim_id;
end $$;

create or replace function review_claim(p_claim_id uuid, p_verify boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_claim person_claims;
begin
  if not has_role('moderator') then raise exception 'Only moderators and admins can verify claims'; end if;
  select * into v_claim from person_claims where id = p_claim_id for update;
  if not found or v_claim.status <> 'pending' then raise exception 'Claim not found or already reviewed'; end if;
  if v_claim.user_id = auth.uid() and not has_role('admin') then
    raise exception 'You can''t verify your own claim. Another moderator needs to review it.';
  end if;
  -- person_claims_apply (0002) links the account and the page when verified
  update person_claims
     set status = case when p_verify then 'verified' else 'rejected' end::claim_status,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_claim_id;
end $$;

-- ---------------------------------------------------------------------
-- Owners can see their own page while it's hidden
-- ---------------------------------------------------------------------
drop policy "people readable" on people;
create policy "people readable" on people for select
  using (not is_hidden or verified_owner_id = auth.uid() or has_role('moderator'));

-- ---------------------------------------------------------------------
-- Owner credits by role name
-- ---------------------------------------------------------------------
create or replace function character_for(p_production_id uuid, p_role text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_show uuid;
  v_char uuid;
begin
  select show_id into v_show from productions where id = p_production_id;
  if v_show is null then raise exception 'Production not found'; end if;
  select id into v_char from show_characters where show_id = v_show and lower(name) = lower(trim(p_role));
  if v_char is null then
    insert into show_characters (show_id, name, sort_order)
    values (v_show, trim(p_role), (select coalesce(max(sort_order), 0) + 1 from show_characters where show_id = v_show))
    returning id into v_char;
  end if;
  return v_char;
end $$;

create or replace function owner_add_credit_named(p_production_id uuid, p_kind credit_kind, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_role text := nullif(trim(p_role), '');
begin
  if v_role is null then raise exception 'Enter the role'; end if;
  if p_kind = 'cast' then
    return owner_add_credit(p_production_id, 'cast', character_for(p_production_id, v_role), null);
  end if;
  return owner_add_credit(p_production_id, 'crew', null, v_role);
end $$;

create or replace function owner_set_credit_role(p_credit_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_credit credits;
  v_role text := nullif(trim(p_role), '');
begin
  if v_role is null then raise exception 'Enter the role'; end if;
  select * into v_credit from credits where id = p_credit_id and person_id = my_person_id();
  if not found then raise exception 'That credit is not on your page'; end if;
  if v_credit.kind = 'cast' then
    perform owner_update_credit(p_credit_id, character_for(v_credit.production_id, v_role), null);
  else
    perform owner_update_credit(p_credit_id, null, v_role);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------
alter table notifications drop constraint notifications_status_check;
alter table notifications add constraint notifications_status_check
  check (status in ('unread', 'kept', 'disputed', 'resolved'));
alter table notifications
  add column dispute_note    text,
  add column resolution      text check (resolution in ('kept', 'undone')),
  add column resolved_by     uuid references profiles (id) on delete set null,
  add column resolved_at     timestamptz;

drop policy "respond to own notifications" on notifications;   -- functions only now

create or replace function respond_notification(p_id uuid, p_keep boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update notifications
     set status = case when p_keep then 'kept' else 'disputed' end,
         dispute_note = case when p_keep then null else nullif(trim(p_note), '') end
   where id = p_id and user_id = auth.uid() and status in ('unread', 'kept', 'disputed');
  if not found then raise exception 'Notification not found'; end if;
end $$;

-- Mark every unread notification as kept (the "Keep all" button)
create or replace function keep_all_notifications() returns void
language sql security definer set search_path = public as $$
  update notifications set status = 'kept' where user_id = auth.uid() and status = 'unread';
$$;

-- Undo one logged change, for disputes. Covers what owners are notified
-- about: credits added or edited, page edits, and approved uploads.
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
           color_ink = null, color_soft = null, color_accent = null
     where poster_media_id = r.entity_id;
  else
    raise exception 'This kind of change can''t be undone automatically';
  end if;
end $$;

create or replace function resolve_dispute(p_id uuid, p_undo boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_note notifications;
begin
  if not has_role('moderator') then raise exception 'Only moderators can resolve disputes'; end if;
  select * into v_note from notifications where id = p_id for update;
  if not found or v_note.status <> 'disputed' then raise exception 'Dispute not found or already resolved'; end if;
  if p_undo then perform revert_revision(v_note.revision_id); end if;
  update notifications
     set status = 'resolved', resolution = case when p_undo then 'undone' else 'kept' end,
         resolved_by = auth.uid(), resolved_at = now()
   where id = p_id;
end $$;

-- Tell owners when someone else changes their page. Unchanged from 0002
-- except: uploads notify only when approved, and the page being verified
-- (or other bookkeeping-only edits) doesn't notify.
create or replace function notify_page_owners() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row     jsonb := coalesce(new.after, new.before);
  v_person  uuid;
  v_prod    uuid;
  v_ignore  text[] := array['verified_owner_id', 'updated_at'];
begin
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

-- ---------------------------------------------------------------------
-- Display-name suggestions (edit_proposals, entity_table 'people')
-- ---------------------------------------------------------------------
create or replace function approve_person_edit(p_proposal_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_prop edit_proposals;
  v_name text;
begin
  if not has_role('moderator') then raise exception 'Only moderators can review suggestions'; end if;
  select * into v_prop from edit_proposals where id = p_proposal_id for update;
  if not found or v_prop.entity_table <> 'people' then raise exception 'Suggestion not found'; end if;
  if v_prop.status <> 'pending' then raise exception 'This suggestion has already been reviewed'; end if;

  if p_approve then
    v_name := nullif(trim(v_prop.changes ->> 'display_name'), '');
    if v_name is not null then
      update people set display_name = v_name, sort_name = sort_name_for(v_name) where id = v_prop.entity_id;
    end if;
  end if;
  -- award_points (0005) gives the contributor points on approval
  update edit_proposals
     set status = case when p_approve then 'approved' else 'rejected' end::moderation_status,
         review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_proposal_id;
end $$;

-- ---------------------------------------------------------------------
-- Search productions (owners adding a credit)
-- ---------------------------------------------------------------------
create or replace function lookup_productions(p_query text, max_results int default 8)
returns table (id uuid, slug text, label text, detail text)
language plpgsql stable set search_path = public as $$
declare
  q text := trim(coalesce(p_query, ''));
begin
  if length(q) < 2 then return; end if;
  return query
    select p.id, p.slug,
           coalesce(p.title_override, s.title) || ' (' || p.year || ')',
           concat_ws(' · ', o.name, l.name)
    from productions p
    join shows s on s.id = p.show_id
    join organizations o on o.id = p.organization_id
    left join locations l on l.id = p.location_id
    where not p.is_hidden
      and (s.title ilike '%' || q || '%' or coalesce(p.title_override, '') ilike '%' || q || '%'
           or word_similarity(q, s.title) >= 0.4 or o.name ilike '%' || q || '%')
    order by lower(s.title) = lower(q) desc, s.title ilike q || '%' desc,
             word_similarity(q, s.title) desc, p.year desc
    limit max_results;
end $$;

-- ---------------------------------------------------------------------
-- "Share with your cast": where a submission's share link should go
-- ---------------------------------------------------------------------
create or replace function submission_destination(p_proposal_id uuid)
returns table (status text, slug text, title text)
language sql stable security definer set search_path = public as $$
  select ep.status::text, p.slug, coalesce(ep.changes -> 'production' ->> 'display_title', 'A production')
  from edit_proposals ep
  left join productions p on p.id = ep.entity_id
  where ep.id = p_proposal_id and ep.entity_table = 'production_submission';
$$;

-- ---------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------
revoke execute on function
  character_for(uuid, text), revert_revision(bigint)
from public, anon, authenticated;
revoke execute on function
  vouch_claim(uuid), review_claim(uuid, boolean),
  owner_add_credit_named(uuid, credit_kind, text), owner_set_credit_role(uuid, text),
  respond_notification(uuid, boolean, text), keep_all_notifications(),
  resolve_dispute(uuid, boolean), approve_person_edit(uuid, boolean, text)
from public, anon;
grant execute on function
  vouch_claim(uuid), review_claim(uuid, boolean),
  owner_add_credit_named(uuid, credit_kind, text), owner_set_credit_role(uuid, text),
  respond_notification(uuid, boolean, text), keep_all_notifications(),
  resolve_dispute(uuid, boolean), approve_person_edit(uuid, boolean, text)
to authenticated;
grant execute on function claim_state(uuid), submission_destination(uuid), lookup_productions(text, int)
to anon, authenticated;
