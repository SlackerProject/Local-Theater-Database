-- =====================================================================
-- Local Theater Database: migration 0040
-- Members can hide their contributor profile (/u/username)
--
--   * profiles.profile_public (on by default): the member's choice.
--   * profile_visible(): public, or it's yours, or you're a moderator.
--   * profile_stats(), recent_contributions() and profile_seen() now
--     return nothing for a hidden profile (the originals are renamed
--     *_all and are no longer callable directly). Their person page "on
--     stage" is not affected.
-- Runs after 0039 (20261022000000_credit_contributors.sql).
-- =====================================================================

alter table profiles add column profile_public boolean not null default true;
grant update (profile_public) on profiles to authenticated;

create or replace function profile_visible(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_user and profile_public)
      or p_user = auth.uid()
      or has_role('moderator');
$$;
grant execute on function profile_visible(uuid) to anon, authenticated;

alter function profile_stats(uuid) rename to profile_stats_all;
alter function recent_contributions(uuid, integer) rename to recent_contributions_all;
alter function profile_seen(uuid) rename to profile_seen_all;
revoke execute on function profile_stats_all(uuid), recent_contributions_all(uuid, integer), profile_seen_all(uuid) from public, anon, authenticated;

create function profile_stats(p_user uuid)
returns table (points numeric, contributions integer, photos integer, seen integer)
language sql stable security definer set search_path = public as $$
  select * from profile_stats_all(p_user) where profile_visible(p_user);
$$;

create function recent_contributions(p_user uuid, p_limit integer default 10)
returns table (amount numeric, reason text, earned_at timestamptz, kind text, entity_table text, entity_id uuid,
               media_kind text, production_id uuid, person_id uuid, credits integer, draft_title text)
language sql stable security definer set search_path = public as $$
  select * from recent_contributions_all(p_user, p_limit) where profile_visible(p_user);
$$;

create function profile_seen(p_user uuid)
returns table (production_id uuid, seen_on timestamptz)
language sql stable security definer set search_path = public as $$
  select * from profile_seen_all(p_user) where profile_visible(p_user);
$$;

grant execute on function profile_stats(uuid), recent_contributions(uuid, integer), profile_seen(uuid) to anon, authenticated;
