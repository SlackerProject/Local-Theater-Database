-- =====================================================================
-- Local Theater Database: migration 0041
-- Bulk upload (moderators): many productions from one spreadsheet
--
--   Each production in the file is saved the usual way (a submission by
--   the moderator, approved at once by approve_submission_checked), so
--   people, roles, understudies, young performers and points all work as
--   they do on the Add form. This adds:
--   * bulk_imports: one row per upload, listing what it created (for
--     Undo) and what it replaced.
--   * bulk_import_start() / bulk_import_add(): record an upload.
--   * bulk_reset_production(): "Replace" clears a production's cast, crew
--     and performances (and sets its dates) before the file's are added.
--   * bulk_import_undo(): within 7 days, deletes the productions an upload
--     created (with anything left over only they used) and the points
--     they earned. Replaced productions are not restored.
-- Runs after 0040 (20261022010000_private_profiles.sql).
-- =====================================================================

create table bulk_imports (
  id               uuid primary key default gen_random_uuid(),
  created_by       uuid references profiles (id) on delete set null,
  file_name        text not null check (length(file_name) <= 300),
  created_at       timestamptz not null default now(),
  created_ids      uuid[] not null default '{}',   -- productions it created
  replaced_ids     uuid[] not null default '{}',   -- productions it replaced
  proposal_ids     uuid[] not null default '{}',   -- its approved submissions
  undone_at        timestamptz
);
alter table bulk_imports enable row level security;
create policy "moderators read bulk imports" on bulk_imports for select using (has_role('moderator'));

create or replace function bulk_import_start(p_file_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not has_role('moderator') then raise exception 'Only moderators can bulk upload'; end if;
  insert into bulk_imports (created_by, file_name) values (auth.uid(), left(coalesce(nullif(trim(p_file_name), ''), 'Spreadsheet'), 300))
  returning id into v_id;
  return v_id;
end $$;

create or replace function bulk_import_add(p_id uuid, p_production uuid, p_proposal uuid, p_replaced boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('moderator') then raise exception 'Only moderators can bulk upload'; end if;
  update bulk_imports
     set created_ids  = case when p_replaced then created_ids else array_append(created_ids, p_production) end,
         replaced_ids = case when p_replaced then array_append(replaced_ids, p_production) else replaced_ids end,
         proposal_ids = array_append(proposal_ids, p_proposal)
   where id = p_id and undone_at is null;
end $$;

-- "Replace": the production keeps its page (and follows, photos, poster),
-- but its cast, crew and performances are cleared for the file's
create or replace function bulk_reset_production(p_id uuid, p_opening date, p_closing date, p_clear_venue boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('moderator') then raise exception 'Only moderators can bulk upload'; end if;
  if not exists (select 1 from productions where id = p_id) then raise exception 'That production no longer exists'; end if;
  delete from credits where production_id = p_id;
  delete from performances where production_id = p_id;
  update productions
     set opening_date = coalesce(p_opening, opening_date),
         closing_date = coalesce(p_closing, closing_date),
         location_id  = case when p_clear_venue then null else location_id end
   where id = p_id;
end $$;

create or replace function bulk_import_undo(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v bulk_imports;
  v_prod uuid;
  v_n int := 0;
begin
  if not has_role('moderator') then raise exception 'Only moderators can undo an upload'; end if;
  select * into v from bulk_imports where id = p_id for update;
  if not found then raise exception 'That upload no longer exists'; end if;
  if v.undone_at is not null then raise exception 'This upload was already undone'; end if;
  if v.created_at < now() - interval '7 days' then raise exception 'Uploads can only be undone for 7 days'; end if;

  foreach v_prod in array v.created_ids loop
    if exists (select 1 from productions where id = v_prod) then
      perform moderator_delete('productions', v_prod, true);
      v_n := v_n + 1;
    end if;
  end loop;
  delete from point_events where ref_id = any(v.proposal_ids);
  if v.created_by is not null then perform refresh_badges(v.created_by); end if;
  update bulk_imports set undone_at = now() where id = p_id;
  return v_n;
end $$;

revoke execute on function bulk_import_start(text), bulk_import_add(uuid, uuid, uuid, boolean),
  bulk_reset_production(uuid, date, date, boolean), bulk_import_undo(uuid) from public, anon;
grant execute on function bulk_import_start(text), bulk_import_add(uuid, uuid, uuid, boolean),
  bulk_reset_production(uuid, date, date, boolean), bulk_import_undo(uuid) to authenticated;
