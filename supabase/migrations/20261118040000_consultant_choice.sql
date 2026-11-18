-- Consultant Choice awards: given outright by the DASH consultants for one
-- standout thing in a show (Badass Combat, Creature Design). No nominees, a
-- distinction of their own, and new each season, so they aren't copied
-- into the next ceremony.

alter table award_categories add column consultant_choice boolean not null default false;

update award_categories set consultant_choice = true, has_nominees = false
 where name in ('Best Lead-In to a Song by a Youth Actor', 'Excellence in Dialect Work', 'Excellence in Projection Design',
                'Excellence in Specialty Makeup', 'Badass Combat Award', 'Creative Community Collaboration Award',
                'Excellence in Fight Direction', 'A Documentary Play With Music', 'Creature Design',
                'Original Instrumental & Vocal Music', 'Achievement in Mechanical Magic: Greased Lightning',
                'Distinguished Achievement in Inclusive Casting');

-- EMACT lists them as given, not nominated
update award_entries e set result = 'won'
  from award_categories k where k.id = e.category_id and k.consultant_choice and e.result <> 'won';

-- Adding an award: nominees then a winner, just the winner, or Consultant Choice
drop function if exists add_ceremony_award(uuid, text, text, boolean);
create or replace function add_ceremony_award(p_ceremony uuid, p_name text, p_kind text, p_has_nominees boolean default true,
                                              p_consultant boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_noms boolean := p_has_nominees and not p_consultant;
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
    if v_cat.kind <> p_kind or v_cat.has_nominees <> v_noms or v_cat.consultant_choice <> p_consultant then
      if exists (select 1 from award_entries where category_id = v_cat.id) then
        raise exception '“%” is already set up differently and has awards saved. Use a slightly different name.', v_cat.name;
      end if;
      update award_categories set kind = p_kind, has_nominees = v_noms, consultant_choice = p_consultant where id = v_cat.id;
    end if;
  else
    insert into award_categories (award_body_id, name, kind, has_nominees, consultant_choice)
    values (v_cer.award_body_id, v_name, p_kind, v_noms, p_consultant) returning * into v_cat;
  end if;

  insert into award_ceremony_categories (ceremony_id, category_id, sort_order)
  values (p_ceremony, v_cat.id, coalesce((select max(sort_order) + 10 from award_ceremony_categories where ceremony_id = p_ceremony), 10))
  on conflict do nothing;
  return v_cat.id;
end $$;

revoke execute on function add_ceremony_award(uuid, text, text, boolean, boolean) from public, anon;
grant execute on function add_ceremony_award(uuid, text, text, boolean, boolean) to authenticated;

-- A new ceremony copies the last one's awards, except Consultant Choice
create or replace function create_award_ceremony(p_name text, p_season text, p_source_url text default null, p_copy boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_name   text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_season text := regexp_replace(trim(coalesce(p_season, '')), '\s*[-–—/]\s*', '–', 'g');
  v_body   uuid;
  v_prev   uuid;
  v_slug   text;
  v_base   text;
  v_n      int := 1;
  v_id     uuid;
begin
  if not has_role('moderator') then raise exception 'Only moderators can add ceremonies'; end if;
  if v_name = '' then raise exception 'Enter the ceremony’s name, like DASH Awards'; end if;
  if v_season !~ '^\d{4}(–\d{4})?$' then raise exception 'Enter the season like 2025–2026, or a single year like 2026'; end if;
  if nullif(trim(p_source_url), '') is not null and trim(p_source_url) !~ '^https?://\S+\.\S+' then
    raise exception 'The source link should be a web address';
  end if;
  if exists (select 1 from award_ceremonies where lower(name) = lower(v_name) and season = v_season) then
    raise exception '% % already exists', v_name, v_season;
  end if;

  select id, award_body_id into v_prev, v_body from award_ceremonies where lower(name) = lower(v_name) order by year desc limit 1;
  if v_body is null then
    v_base := slugify(v_name);
    v_slug := v_base;
    while exists (select 1 from award_bodies where slug = v_slug) loop v_n := v_n + 1; v_slug := v_base || '-' || v_n; end loop;
    insert into award_bodies (slug, name) values (v_slug, v_name) returning id into v_body;
  end if;

  v_base := slugify(v_name || ' ' || v_season);
  v_slug := v_base; v_n := 1;
  while exists (select 1 from award_ceremonies where slug = v_slug) loop v_n := v_n + 1; v_slug := v_base || '-' || v_n; end loop;

  insert into award_ceremonies (award_body_id, slug, name, season, year, source_url)
  values (v_body, v_slug, v_name, v_season, season_year(v_season), nullif(trim(p_source_url), ''))
  returning id into v_id;

  if p_copy and v_prev is not null then
    insert into award_ceremony_categories (ceremony_id, category_id, sort_order)
    select v_id, cc.category_id, cc.sort_order
      from award_ceremony_categories cc join award_categories k on k.id = cc.category_id
     where cc.ceremony_id = v_prev and not k.consultant_choice;
  end if;
  return v_id;
end $$;
