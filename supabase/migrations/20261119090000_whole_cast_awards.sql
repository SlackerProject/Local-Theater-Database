-- Awards the whole cast shares (Outstanding Ensemble Performance): they
-- show on the page of everyone credited in the show's cast. Nothing is
-- copied; each person's page looks them up, so later cast additions get
-- them too.

alter table award_categories add column whole_cast boolean not null default false;

update award_categories set whole_cast = true
 where kind = 'production' and name ilike 'Outstanding Ensemble Performance%';

-- Adding an award can say the whole cast shares it (production awards only)
drop function if exists add_ceremony_award(uuid, text, text, boolean, boolean);
create or replace function add_ceremony_award(p_ceremony uuid, p_name text, p_kind text, p_has_nominees boolean default true,
                                              p_consultant boolean default false, p_whole_cast boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_noms boolean := p_has_nominees and not p_consultant;
  v_cast boolean := p_whole_cast and p_kind = 'production';
  v_cer  award_ceremonies;
  v_cat  award_categories;
begin
  if not has_role('moderator') then raise exception 'Only moderators can add awards'; end if;
  select * into v_cer from award_ceremonies where id = p_ceremony;
  if not found then raise exception 'That ceremony no longer exists'; end if;
  if v_name = '' then raise exception 'Enter the award’s name'; end if;
  if p_kind not in ('performer', 'youth', 'creative', 'production', 'company', 'person') then raise exception 'Choose who it goes to'; end if;

  select * into v_cat from award_categories where award_body_id = v_cer.award_body_id and lower(name) = lower(v_name);
  if found then
    if v_cat.kind <> p_kind or v_cat.has_nominees <> v_noms or v_cat.consultant_choice <> p_consultant or v_cat.whole_cast <> v_cast then
      if exists (select 1 from award_entries where category_id = v_cat.id) and (v_cat.kind <> p_kind or v_cat.has_nominees <> v_noms or v_cat.consultant_choice <> p_consultant) then
        raise exception '“%” is already set up differently and has awards saved. Use a slightly different name.', v_cat.name;
      end if;
      update award_categories set kind = p_kind, has_nominees = v_noms, consultant_choice = p_consultant, whole_cast = v_cast where id = v_cat.id;
    end if;
  else
    insert into award_categories (award_body_id, name, kind, has_nominees, consultant_choice, whole_cast)
    values (v_cer.award_body_id, v_name, p_kind, v_noms, p_consultant, v_cast) returning * into v_cat;
  end if;

  insert into award_ceremony_categories (ceremony_id, category_id, sort_order)
  values (p_ceremony, v_cat.id, coalesce((select max(sort_order) + 10 from award_ceremony_categories where ceremony_id = p_ceremony), 10))
  on conflict do nothing;
  return v_cat.id;
end $$;

revoke execute on function add_ceremony_award(uuid, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function add_ceremony_award(uuid, text, text, boolean, boolean, boolean) to authenticated;
