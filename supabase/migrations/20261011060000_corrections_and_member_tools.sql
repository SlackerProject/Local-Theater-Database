-- =====================================================================
-- Local Theater Database: migration 0013
-- Corrections (BoardGameGeek-style edit pages) and member moderation tools
--
-- Adds:
--   * submit_correction(): one correction to a production, person,
--     company, show or venue: changed fields, plus (productions) cast/crew
--     and performance additions, changes and removals, and a note to the
--     moderator. Moderators' corrections apply at once; others wait.
--   * review_correction(): a moderator approves some or all of the
--     changes (each change has a key such as 'field:year' or
--     'credit:remove:<id>') and the rest are left out.
--   * Roles: set_member_role() lets the admin make members trusted
--     editors or moderators.
--   * Suspensions: suspend_member() / restore_member(). A suspended
--     account can't submit, upload or claim, loses any role permissions,
--     and its waiting submissions are rejected.
--   * Limits for regular members: 25 waiting submissions, 30 per hour,
--     and 40 waiting uploads.
--   * member_overview(): the moderators' member list with activity counts.
-- Runs after 0012 (20261011050000_seen_counts_and_suggestions.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Suspensions
-- ---------------------------------------------------------------------
alter table profiles
  add column banned_at     timestamptz,
  add column banned_reason text check (length(banned_reason) <= 500),
  add column banned_by     uuid references profiles (id) on delete set null;

-- Signed-out visitors never update profiles (row rules already block it)
revoke update on profiles from anon;

-- A suspended account keeps its role on paper but loses its permissions
create or replace function has_role(min_role user_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role >= min_role and banned_at is null);
$$;

create or replace function is_banned() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select banned_at is not null from profiles where id = auth.uid()), false);
$$;

alter policy "propose edits" on edit_proposals
  with check (proposed_by = auth.uid() and status = 'pending' and not is_banned());
alter policy "media upload" on media
  with check (uploaded_by = auth.uid() and status = 'pending' and not is_banned()
              and storage_key like ('uploads/' || auth.uid()::text || '/%')
              and (thumb_key is null or thumb_key like ('uploads/' || auth.uid()::text || '/%')));
-- Reviews go through the review functions; only moderators may touch rows
-- directly (trusted editors could otherwise approve, and earn points for,
-- their own submissions)
alter policy "review proposals" on edit_proposals
  using (has_role('moderator')) with check (has_role('moderator'));

alter policy "submit own claim" on person_claims
  with check (user_id = auth.uid() and status = 'pending' and vouched_by is null and reviewed_by is null and not is_banned());

-- Every submission (forms, corrections, auditions, suggestions) passes here
create or replace function guard_proposal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id = new.proposed_by and banned_at is not null) then
    raise exception 'Your account is suspended, so it can''t send changes.';
  end if;
  if not exists (select 1 from profiles where id = new.proposed_by and role >= 'trusted') then
    if (select count(*) from edit_proposals where proposed_by = new.proposed_by and status = 'pending') >= 25 then
      raise exception 'You have 25 submissions waiting for review. Please wait for a moderator before sending more.';
    end if;
    if (select count(*) from edit_proposals where proposed_by = new.proposed_by and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'That''s a lot of changes in one hour. Please wait a little before sending more.';
    end if;
  end if;
  return new;
end $$;
create trigger edit_proposals_guard before insert on edit_proposals
  for each row execute function guard_proposal();

create or replace function guard_upload() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id = new.uploaded_by and banned_at is not null) then
    raise exception 'Your account is suspended, so it can''t upload.';
  end if;
  if not exists (select 1 from profiles where id = new.uploaded_by and role >= 'trusted')
     and (select count(*) from media where uploaded_by = new.uploaded_by and status = 'pending') >= 40 then
    raise exception 'You have 40 uploads waiting for review. Please wait for a moderator before uploading more.';
  end if;
  return new;
end $$;
create trigger media_guard before insert on media
  for each row execute function guard_upload();

-- Moderators suspend accounts below their own role; returns how many
-- waiting submissions and uploads were rejected
create or replace function suspend_member(p_user uuid, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_mine user_role;
  v_theirs user_role;
  v_n int;
  v_m int;
begin
  if not has_role('moderator') then raise exception 'Only moderators can suspend accounts'; end if;
  if p_user = auth.uid() then raise exception 'You can''t suspend yourself'; end if;
  select role into v_mine from profiles where id = auth.uid();
  select role into v_theirs from profiles where id = p_user;
  if v_theirs is null then raise exception 'Member not found'; end if;
  if v_theirs >= v_mine then raise exception 'You can only suspend members below your own role'; end if;

  update profiles set banned_at = now(), banned_reason = nullif(trim(p_reason), ''), banned_by = auth.uid() where id = p_user;
  update edit_proposals
     set status = 'rejected', review_note = 'Account suspended', reviewed_by = auth.uid(), reviewed_at = now()
   where proposed_by = p_user and status = 'pending';
  get diagnostics v_n = row_count;
  update media
     set status = 'rejected', review_note = 'Account suspended', reviewed_by = auth.uid(), reviewed_at = now()
   where uploaded_by = p_user and status = 'pending';
  get diagnostics v_m = row_count;
  update person_claims set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
   where user_id = p_user and status = 'pending';
  return v_n + v_m;
end $$;

create or replace function restore_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mine user_role;
begin
  if not has_role('moderator') then raise exception 'Only moderators can restore accounts'; end if;
  select role into v_mine from profiles where id = auth.uid();
  update profiles set banned_at = null, banned_reason = null, banned_by = null
   where id = p_user and role < v_mine;
  if not found then raise exception 'Member not found, or not below your role'; end if;
end $$;

-- The admin hands out roles (but not admin itself, and never their own)
create or replace function set_member_role(p_user uuid, p_role user_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('admin') then raise exception 'Only the admin can change roles'; end if;
  if p_user = auth.uid() then raise exception 'You can''t change your own role'; end if;
  if p_role = 'admin' then raise exception 'The admin role can''t be given from the site'; end if;
  if exists (select 1 from profiles where id = p_user and role = 'admin') then
    raise exception 'Another admin''s role can''t be changed here';
  end if;
  update profiles set role = p_role where id = p_user;
  if not found then raise exception 'Member not found'; end if;
end $$;

create or replace function member_overview(p_query text default null)
returns table (id uuid, username text, display_name text, role user_role, joined timestamptz,
               banned_at timestamptz, banned_reason text, pending int, approved int, rejected int,
               uploads int, last_active timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.role, p.created_at, p.banned_at, p.banned_reason,
         coalesce(e.pending, 0), coalesce(e.approved, 0), coalesce(e.rejected, 0), coalesce(m.uploads, 0),
         greatest(e.last_at, m.last_at)
  from profiles p
  left join (
    select proposed_by,
           count(*) filter (where status = 'pending')::int pending,
           count(*) filter (where status = 'approved')::int approved,
           count(*) filter (where status = 'rejected')::int rejected,
           max(created_at) last_at
    from edit_proposals group by proposed_by
  ) e on e.proposed_by = p.id
  left join (select uploaded_by, count(*)::int uploads, max(created_at) last_at from media group by uploaded_by) m
    on m.uploaded_by = p.id
  where has_role('moderator')
    and (nullif(trim(p_query), '') is null
         or p.username::text ilike '%' || trim(p_query) || '%'
         or p.display_name ilike '%' || trim(p_query) || '%')
  order by greatest(e.last_at, m.last_at) desc nulls last, p.created_at desc
  limit 200;
$$;

-- ---------------------------------------------------------------------
-- Corrections
-- ---------------------------------------------------------------------

-- Fields a correction may change, per kind of page
create or replace function correction_fields(p_table text) returns text[]
language sql immutable as $$
  select case p_table
    when 'productions' then array['year', 'title_override', 'opening_date', 'closing_date', 'description',
                                  'ticket_url', 'organization_id', 'location_id']
    when 'people' then array['display_name', 'bio']
    when 'organizations' then array['name', 'short_name', 'town', 'state', 'website_url', 'founded_year', 'description']
    when 'shows' then array['title', 'subtitle', 'type', 'authors', 'premiere_year', 'synopsis']
    when 'locations' then array['name', 'street_address', 'town', 'state', 'postal_code', 'seating_capacity', 'description']
  end;
$$;

-- Older person suggestions stored {"display_name": ...} directly
create or replace function correction_changes(p_changes jsonb) returns jsonb
language sql immutable as $$
  select case
    when p_changes ? 'fields' or p_changes ? 'credits' or p_changes ? 'performances' then p_changes
    else jsonb_build_object('fields', coalesce(p_changes, '{}'))
  end;
$$;

-- Apply a correction's accepted changes (all of them when p_accept is
-- null). Returns how many were applied. Internal: called by
-- submit_correction() and review_correction().
create or replace function apply_correction(p_proposal_id uuid, p_accept text[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_prop edit_proposals;
  c jsonb;
  v_set text;
  v_n int := 0;
  v jsonb;
  i bigint;
  v_credit credits;
  v_person uuid;
  v_new uuid;
  v_role text;
  ok boolean;
begin
  select * into v_prop from edit_proposals where id = p_proposal_id;
  c := correction_changes(v_prop.changes);

  -- Fields, all in one update
  select string_agg(format('%I = r.%I', k, k), ', '), count(*)
    into v_set, i
    from jsonb_object_keys(coalesce(c -> 'fields', '{}')) k
   where k = any(correction_fields(v_prop.entity_table))
     and (p_accept is null or 'field:' || k = any(p_accept));
  if v_set is not null then
    execute format('update %I t set %s from jsonb_populate_record(null::%I, $1) r where t.id = $2',
                   v_prop.entity_table, v_set, v_prop.entity_table)
      using c -> 'fields', v_prop.entity_id;
    v_n := v_n + i;
    if v_prop.entity_table = 'people' and (c -> 'fields') ? 'display_name'
       and (p_accept is null or 'field:display_name' = any(p_accept)) then
      update people set sort_name = sort_name_for(display_name) where id = v_prop.entity_id;
    end if;
  end if;

  if v_prop.entity_table <> 'productions' then return v_n; end if;

  -- Credits: removals, role changes, additions
  for v in select * from jsonb_array_elements(coalesce(c -> 'credits' -> 'remove', '[]')) loop
    if p_accept is null or 'credit:remove:' || (v #>> '{}') = any(p_accept) then
      delete from credits where id = (v #>> '{}')::uuid and production_id = v_prop.entity_id;
      v_n := v_n + 1;
    end if;
  end loop;

  for v in select * from jsonb_array_elements(coalesce(c -> 'credits' -> 'update', '[]')) loop
    if p_accept is null or 'credit:update:' || (v ->> 'id') = any(p_accept) then
      select * into v_credit from credits where id = (v ->> 'id')::uuid and production_id = v_prop.entity_id;
      v_role := nullif(trim(v ->> 'role'), '');
      if found and v_role is not null then
        if v_credit.kind = 'cast' then
          update credits set character_id = character_for(v_prop.entity_id, v_role), role_name = null where id = v_credit.id;
        else
          update credits set role_name = v_role where id = v_credit.id;
        end if;
        v_n := v_n + 1;
      end if;
    end if;
  end loop;

  for v, i in select value, ordinality - 1 from jsonb_array_elements(coalesce(c -> 'credits' -> 'add', '[]')) with ordinality loop
    if p_accept is null or 'credit:add:' || i = any(p_accept) then
      v_role := nullif(trim(v ->> 'role'), '');
      continue when v_role is null;
      if nullif(v ->> 'person_id', '') is not null then
        v_person := (v ->> 'person_id')::uuid;
      else
        insert into people (slug, display_name, sort_name, adult_attested_at, adult_attested_by, created_by)
        values (unique_slug('people', trim(v ->> 'new_name')), trim(v ->> 'new_name'), sort_name_for(v ->> 'new_name'),
                now(), v_prop.proposed_by, v_prop.proposed_by)
        returning id into v_person;
      end if;
      insert into credits (production_id, person_id, kind, character_id, role_name, billing_order, created_by)
      values (v_prop.entity_id, v_person, (v ->> 'kind')::credit_kind,
              case when v ->> 'kind' = 'cast' then character_for(v_prop.entity_id, v_role) end,
              case when v ->> 'kind' = 'crew' then v_role end,
              (select coalesce(max(billing_order), 0) + 1 from credits
                where production_id = v_prop.entity_id and kind = (v ->> 'kind')::credit_kind),
              v_prop.proposed_by)
      returning id into v_new;
      v_n := v_n + 1;
      -- Tell the person's followers (not the person themself)
      insert into notifications (user_id, kind, production_id, person_id, credit_id)
      select f.user_id, 'cast_announcement', v_prop.entity_id, v_person, v_new
      from follows f join people pe on pe.id = f.person_id
      where f.person_id = v_person and not pe.is_hidden and f.user_id is distinct from pe.verified_owner_id
      on conflict do nothing;
    end if;
  end loop;

  -- Performances: removals, changes, additions (Massachusetts time)
  for v in select * from jsonb_array_elements(coalesce(c -> 'performances' -> 'remove', '[]')) loop
    if p_accept is null or 'perf:remove:' || (v #>> '{}') = any(p_accept) then
      delete from performances where id = (v #>> '{}')::uuid and production_id = v_prop.entity_id;
      v_n := v_n + 1;
    end if;
  end loop;

  for v in select * from jsonb_array_elements(coalesce(c -> 'performances' -> 'update', '[]')) loop
    if p_accept is null or 'perf:update:' || (v ->> 'id') = any(p_accept) then
      update performances
         set starts_at = ((v ->> 'date')::date + coalesce(nullif(v ->> 'time', ''), '19:30')::time) at time zone 'America/New_York',
             label = nullif(trim(v ->> 'label'), ''),
             is_cancelled = coalesce((v ->> 'cancelled')::boolean, false)
       where id = (v ->> 'id')::uuid and production_id = v_prop.entity_id;
      v_n := v_n + 1;
    end if;
  end loop;

  for v, i in select value, ordinality - 1 from jsonb_array_elements(coalesce(c -> 'performances' -> 'add', '[]')) with ordinality loop
    if p_accept is null or 'perf:add:' || i = any(p_accept) then
      insert into performances (production_id, starts_at, label)
      values (v_prop.entity_id,
              ((v ->> 'date')::date + coalesce(nullif(v ->> 'time', ''), '19:30')::time) at time zone 'America/New_York',
              nullif(trim(v ->> 'label'), ''))
      on conflict (production_id, starts_at) do nothing;
      v_n := v_n + 1;
    end if;
  end loop;

  return v_n;
end $$;

-- Returns 'published' (moderators) or 'pending'
create or replace function submit_correction(p_table text, p_id uuid, p_changes jsonb, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare
  c jsonb := correction_changes(coalesce(p_changes, '{}'));
  k text;
  v jsonb;
  v_exists boolean;
  v_count int;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_table not in ('productions', 'people', 'organizations', 'shows', 'locations') then
    raise exception 'That page can''t be corrected here';
  end if;
  execute format('select exists (select 1 from %I where id = $1)', p_table) into v_exists using p_id;
  if not v_exists then raise exception 'That page no longer exists'; end if;

  for k in select jsonb_object_keys(coalesce(c -> 'fields', '{}')) loop
    if not k = any(correction_fields(p_table)) then raise exception 'Unknown field: %', k; end if;
  end loop;
  -- A verified person writes their own bio
  if p_table = 'people' and (c -> 'fields') ? 'bio' and exists (
    select 1 from people where id = p_id and verified_owner_id is not null and verified_owner_id <> auth.uid()
  ) then
    raise exception 'This person manages their own bio';
  end if;
  if p_table <> 'productions' and (c ? 'credits' or c ? 'performances') then
    raise exception 'Cast, crew and dates belong to productions';
  end if;
  for v in select * from jsonb_array_elements(coalesce(c -> 'credits' -> 'add', '[]')) loop
    if v ->> 'kind' not in ('cast', 'crew') or nullif(trim(v ->> 'role'), '') is null then
      raise exception 'Each person added needs a role';
    end if;
    if nullif(v ->> 'person_id', '') is null then
      if nullif(trim(v ->> 'new_name'), '') is null then raise exception 'Each person added needs a name'; end if;
      if coalesce((v ->> 'adult_confirmed')::boolean, false) is not true then
        raise exception 'Confirm that everyone new is 18 or older';
      end if;
    end if;
  end loop;
  for v in select * from jsonb_array_elements(coalesce(c -> 'performances' -> 'add', '[]') || coalesce(c -> 'performances' -> 'update', '[]')) loop
    if coalesce(v ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Each performance needs a date'; end if;
  end loop;

  select coalesce((select count(*) from jsonb_object_keys(coalesce(c -> 'fields', '{}'))), 0)
       + coalesce(jsonb_array_length(c -> 'credits' -> 'add'), 0) + coalesce(jsonb_array_length(c -> 'credits' -> 'remove'), 0)
       + coalesce(jsonb_array_length(c -> 'credits' -> 'update'), 0) + coalesce(jsonb_array_length(c -> 'performances' -> 'add'), 0)
       + coalesce(jsonb_array_length(c -> 'performances' -> 'remove'), 0) + coalesce(jsonb_array_length(c -> 'performances' -> 'update'), 0)
    into v_count;
  if v_count = 0 and nullif(trim(p_note), '') is null then raise exception 'Nothing has changed yet'; end if;

  insert into edit_proposals (entity_table, entity_id, changes, note, proposed_by)
  values (p_table, p_id, c, nullif(trim(left(p_note, 2000)), ''), auth.uid())
  returning id into v_id;

  if has_role('moderator') and v_count > 0 then
    perform apply_correction(v_id, null);
    update edit_proposals set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = v_id;
    return 'published';
  end if;
  return 'pending';
end $$;

-- Moderator review: apply the accepted changes; none accepted = rejected
create or replace function review_correction(p_proposal_id uuid, p_accept text[], p_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_prop edit_proposals;
  v_n int := 0;
begin
  if not has_role('moderator') then raise exception 'Only moderators can review corrections'; end if;
  select * into v_prop from edit_proposals where id = p_proposal_id for update;
  if not found or v_prop.entity_table not in ('productions', 'people', 'organizations', 'shows', 'locations') then
    raise exception 'Correction not found';
  end if;
  if v_prop.status <> 'pending' then raise exception 'This correction has already been reviewed'; end if;
  if coalesce(array_length(p_accept, 1), 0) > 0 then
    v_n := apply_correction(p_proposal_id, p_accept);
  end if;
  update edit_proposals
     set status = case when coalesce(array_length(p_accept, 1), 0) > 0 then 'approved' else 'rejected' end::moderation_status,
         approved_changes = to_jsonb(coalesce(p_accept, '{}')),
         review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_proposal_id;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------
revoke execute on function apply_correction(uuid, text[]) from public, anon, authenticated;
revoke execute on function submit_correction(text, uuid, jsonb, text), review_correction(uuid, text[], text),
  suspend_member(uuid, text), restore_member(uuid), set_member_role(uuid, user_role), member_overview(text)
  from public, anon;
grant execute on function submit_correction(text, uuid, jsonb, text), review_correction(uuid, text[], text),
  suspend_member(uuid, text), restore_member(uuid), set_member_role(uuid, user_role), member_overview(text)
  to authenticated;
