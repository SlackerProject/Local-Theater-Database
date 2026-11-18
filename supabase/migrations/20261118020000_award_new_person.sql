-- A moderator entering an award for someone who isn't on the site yet (often
-- a Lifetime Achievement honoree) adds them as a new person, confirming
-- they're 18 or older, as everywhere else on the site.

create or replace function create_person_for_award(p_name text, p_adult boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if not has_role('moderator') then raise exception 'Only moderators can do this'; end if;
  if v_name = '' then raise exception 'Enter their name'; end if;
  if p_adult is not true then raise exception 'Confirm they’re 18 or older'; end if;
  insert into people (slug, display_name, sort_name, adult_attested_at, adult_attested_by, created_by)
  values (unique_slug('people', v_name), v_name, sort_name_for(v_name), now(), auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function create_person_for_award(text, boolean) from public, anon;
grant execute on function create_person_for_award(text, boolean) to authenticated;
