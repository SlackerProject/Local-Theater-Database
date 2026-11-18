-- One nomination can name several people (a design team), and one show can
-- have several separate nominations in the same award (three Lead Performer
-- nominees from the same musical). nomination_id ties together the entries
-- of one nomination, so each is listed once with all its names.

alter table award_entries add column nomination_id uuid;

-- Until now, entries for the same award, show and result were one nomination
update award_entries e set nomination_id = g.nid
  from (select ceremony_id, category_id, coalesce(production_id, person_id, organization_id) as who, result, gen_random_uuid() as nid
          from award_entries group by 1, 2, 3, 4) g
 where g.ceremony_id = e.ceremony_id and g.category_id = e.category_id
   and g.who = coalesce(e.production_id, e.person_id, e.organization_id) and g.result = e.result;

alter table award_entries alter column nomination_id set default gen_random_uuid();
alter table award_entries alter column nomination_id set not null;
create index on award_entries (nomination_id);

-- apply_award: entries sent together share one nomination
create or replace function apply_award(p_proposal_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c jsonb;
  v_by uuid;
  v_cer award_ceremonies;
begin
  select changes, proposed_by into c, v_by from edit_proposals where id = p_proposal_id;
  select * into v_cer from award_ceremonies where id = (c ->> 'ceremony_id')::uuid;
  if not found then raise exception 'Choose the ceremony'; end if;
  insert into award_entries (ceremony_id, category_id, award_year, production_id, person_id, credit_id, organization_id,
                             result, source_url, created_by, nomination_id)
  values (v_cer.id, (c ->> 'category_id')::uuid, v_cer.year,
          nullif(c ->> 'production_id', '')::uuid, nullif(c ->> 'person_id', '')::uuid, nullif(c ->> 'credit_id', '')::uuid,
          nullif(c ->> 'organization_id', '')::uuid,
          (c ->> 'result')::award_result, trim(c ->> 'source_url'), v_by,
          coalesce(nullif(c ->> 'nomination_id', '')::uuid, gen_random_uuid()))
  on conflict do nothing;
end $$;
