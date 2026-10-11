-- =====================================================================
-- Local Theater Database: migration 0017
-- Corrections earn 0.5 points
--
-- Points can now hold one decimal place. An approved correction to a
-- production, person, company, show or venue earns 0.5 (reason
-- 'correction_approved'); audition dates and award entries still earn 2.
-- Past corrections are recalculated.
-- Runs after 0016 (20261012020000_live_hotlist.sql).
-- =====================================================================

drop view user_points;
drop function recent_contributions(uuid, int);
drop function profile_stats(uuid);

alter table point_events alter column amount type numeric(7,1);
alter table point_events drop constraint point_events_reason_check;
alter table point_events add constraint point_events_reason_check check (reason in (
  'production_approved', 'poster_approved', 'photo_approved', 'correction_approved', 'edit_approved', 'adjustment'));

create view user_points with (security_invoker = true) as
  select user_id, sum(amount) as points
  from point_events
  group by user_id;
grant select on user_points to anon, authenticated;

-- Recalculate past corrections
update point_events pe
   set amount = 0.5, reason = 'correction_approved'
  from edit_proposals ep
 where ep.id = pe.ref_id and pe.reason = 'edit_approved'
   and ep.entity_table in ('productions', 'people', 'organizations', 'shows', 'locations');

-- Unchanged from 0014 apart from corrections earning 0.5
create or replace function award_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_was text := case when tg_op = 'UPDATE' then old.status::text end;
begin
  if new.status <> 'approved' or v_was = 'approved' then return new; end if;
  if tg_table_name = 'edit_proposals' then
    if new.entity_table = 'production_submission' then
      if submission_earned_before(new.changes) then return new; end if;
      insert into point_events (user_id, amount, reason, ref_id)
      values (new.proposed_by, 10, 'production_approved', new.id) on conflict do nothing;
    elsif new.entity_table in ('productions', 'people', 'organizations', 'shows', 'locations') then
      insert into point_events (user_id, amount, reason, ref_id)
      values (new.proposed_by, 0.5, 'correction_approved', new.id) on conflict do nothing;
    else
      insert into point_events (user_id, amount, reason, ref_id)
      values (new.proposed_by, 2, 'edit_approved', new.id) on conflict do nothing;
    end if;
  elsif tg_table_name = 'media' then
    insert into point_events (user_id, amount, reason, ref_id)
    values (new.uploaded_by,
            case when new.kind = 'poster' then 3 else 2 end,
            case when new.kind = 'poster' then 'poster_approved' else 'photo_approved' end,
            new.id)
    on conflict do nothing;
  end if;
  return new;
end $$;

-- Unchanged from 0014 apart from points being numeric
create or replace function refresh_badges(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles;
  v_points numeric;
  v_seen int;
  v_photos int;
  v_founding jsonb;
  v_badges text[] := '{}';
begin
  select * into v_profile from profiles where id = p_user;
  if not found then return; end if;
  select coalesce(sum(amount), 0) into v_points from point_events where user_id = p_user;
  select count(*) into v_seen from watch_list where user_id = p_user and status = 'seen';
  select count(*) into v_photos from media where uploaded_by = p_user and kind = 'production_photo' and status = 'approved';
  select value into v_founding from site_settings where key = 'founding';

  v_badges := array(select t.badge from level_thresholds() t where v_points >= t.points);
  if v_profile.role >= 'moderator' then v_badges := v_badges || 'moderator'::text; end if;
  if exists (select 1 from people where verified_owner_id = p_user) then v_badges := v_badges || 'verified'::text; end if;
  if coalesce((v_founding ->> 'open')::boolean, false)
     or v_profile.created_at < (v_founding ->> 'closed_at')::timestamptz then
    v_badges := v_badges || 'founding'::text;
  end if;
  v_badges := v_badges || array(select 'seen-' || n from unnest(array[10, 25, 50, 100, 250]) n where v_seen >= n);
  v_badges := v_badges || array(select 'photos-' || n from unnest(array[10, 50]) n where v_photos >= n);

  insert into user_badges (user_id, badge)
  select p_user, unnest(v_badges)
  on conflict do nothing;
end $$;

create or replace function profile_stats(p_user uuid)
returns table (points numeric, contributions int, photos int, seen int)
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(amount) from point_events where user_id = p_user), 0),
         ((select count(*) from edit_proposals where proposed_by = p_user and status = 'approved')
          + (select count(*) from media where uploaded_by = p_user and status = 'approved'))::int,
         (select count(*) from media where uploaded_by = p_user and kind = 'production_photo' and status = 'approved')::int,
         case when exists (select 1 from profiles where id = p_user and (show_seen or id = auth.uid()))
              then (select count(*) from watch_list where user_id = p_user and status = 'seen')::int end;
$$;

create or replace function recent_contributions(p_user uuid, p_limit int default 10)
returns table (amount numeric, reason text, earned_at timestamptz, kind text, entity_table text, entity_id uuid,
               media_kind text, production_id uuid, person_id uuid, credits int, draft_title text)
language sql stable security definer set search_path = public as $$
  select pe.amount, pe.reason, pe.created_at,
         case when ep.id is not null then 'proposal' when m.id is not null then 'media' else 'adjustment' end,
         ep.entity_table, ep.entity_id, m.kind::text, m.production_id, m.person_id,
         case when ep.entity_table = 'production_submission'
                   and jsonb_typeof(coalesce(ep.approved_changes, ep.changes) -> 'credits') = 'array'
              then jsonb_array_length(coalesce(ep.approved_changes, ep.changes) -> 'credits') else 0 end,
         coalesce(ep.changes -> 'production' ->> 'display_title', '')
  from point_events pe
  left join edit_proposals ep on ep.id = pe.ref_id and pe.reason in ('production_approved', 'correction_approved', 'edit_approved')
  left join media m on m.id = pe.ref_id and pe.reason in ('poster_approved', 'photo_approved')
  where pe.user_id = p_user
  order by pe.created_at desc
  limit least(p_limit, 50);
$$;

grant execute on function profile_stats(uuid), recent_contributions(uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------
-- A new person named twice in one correction (two roles) is one person
-- ---------------------------------------------------------------------
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
  v_created jsonb := '{}';   -- lower(name) -> the person created for it
  v_key text;
begin
  select * into v_prop from edit_proposals where id = p_proposal_id;
  c := correction_changes(v_prop.changes);

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
        v_key := lower(regexp_replace(trim(v ->> 'new_name'), '\s+', ' ', 'g'));
        if v_created ? v_key then
          v_person := (v_created ->> v_key)::uuid;
        else
          insert into people (slug, display_name, sort_name, adult_attested_at, adult_attested_by, created_by)
          values (unique_slug('people', trim(v ->> 'new_name')), trim(v ->> 'new_name'), sort_name_for(v ->> 'new_name'),
                  now(), v_prop.proposed_by, v_prop.proposed_by)
          returning id into v_person;
          v_created := v_created || jsonb_build_object(v_key, v_person);
        end if;
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
      insert into notifications (user_id, kind, production_id, person_id, credit_id)
      select f.user_id, 'cast_announcement', v_prop.entity_id, v_person, v_new
      from follows f join people pe on pe.id = f.person_id
      where f.person_id = v_person and not pe.is_hidden and f.user_id is distinct from pe.verified_owner_id
      on conflict do nothing;
    end if;
  end loop;

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
revoke execute on function apply_correction(uuid, text[]) from public, anon, authenticated;
