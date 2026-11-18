-- Some awards have nominees and a winner (Lead Performer); special honors are
-- simply given to someone (Lifetime Achievement). Winner-only awards save
-- every entry as a win.

alter table award_categories add column has_nominees boolean not null default true;
update award_categories set has_nominees = false
 where name in ('Lifetime Achievement Award', 'Diversity, Equity & Inclusion Impact Award');

create or replace function award_entry_winner_only() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (select has_nominees from award_categories where id = new.category_id) then new.result := 'won'; end if;
  return new;
end $$;

drop trigger if exists award_entries_winner_only on award_entries;
create trigger award_entries_winner_only before insert or update on award_entries
  for each row execute function award_entry_winner_only();

-- Adding an award now says whether it has nominees
drop function if exists add_ceremony_award(uuid, text, text);
create or replace function add_ceremony_award(p_ceremony uuid, p_name text, p_kind text, p_has_nominees boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
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
    if v_cat.kind <> p_kind or v_cat.has_nominees <> p_has_nominees then
      if exists (select 1 from award_entries where category_id = v_cat.id) then
        raise exception '“%” is already set up differently and has awards saved. Use a slightly different name.', v_cat.name;
      end if;
      update award_categories set kind = p_kind, has_nominees = p_has_nominees where id = v_cat.id;
    end if;
  else
    insert into award_categories (award_body_id, name, kind, has_nominees)
    values (v_cer.award_body_id, v_name, p_kind, p_has_nominees) returning * into v_cat;
  end if;

  insert into award_ceremony_categories (ceremony_id, category_id, sort_order)
  values (p_ceremony, v_cat.id, coalesce((select max(sort_order) + 10 from award_ceremony_categories where ceremony_id = p_ceremony), 10))
  on conflict do nothing;
  return v_cat.id;
end $$;

revoke execute on function add_ceremony_award(uuid, text, text, boolean) from public, anon;
grant execute on function add_ceremony_award(uuid, text, text, boolean) to authenticated;
