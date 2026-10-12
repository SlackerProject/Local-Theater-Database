-- =====================================================================
-- Local Theater Database: migration 0026
-- Credits count productions, not roles
--
-- lookup() (the "3 credits, most recently at …" hint when picking a
-- person) counted every role, so someone with five roles in one show had
-- five credits. It now counts each production once. Otherwise as in
-- 20261010170000_submissions.sql.
-- Runs after 0025 (20261014040000_understudies.sql).
-- =====================================================================
create or replace function lookup(p_kind text, p_query text, max_results int default 6)
returns table (id uuid, slug text, label text, detail text)
language plpgsql stable set search_path = public as $$
declare
  q text := trim(coalesce(p_query, ''));
  -- Looser than pg_trgm's default 0.6, so typos like "Michal" still find "Michael"
  min_sim constant real := 0.4;
begin
  if length(q) < 2 then
    return;
  end if;

  if p_kind = 'shows' then
    return query
      select s.id, s.slug, s.title,
             concat_ws(' · ', s.subtitle, initcap(s.type::text))
      from shows s
      where s.title ilike '%' || q || '%' or word_similarity(q, s.title) >= min_sim
      order by lower(s.title) = lower(q) desc, s.title ilike q || '%' desc,
               word_similarity(q, s.title) desc, s.title
      limit max_results;

  elsif p_kind = 'organizations' then
    return query
      select o.id, o.slug, o.name, concat_ws(', ', o.town, o.state)
      from organizations o
      where o.name ilike '%' || q || '%' or word_similarity(q, o.name) >= min_sim
         or o.short_name ilike '%' || q || '%'
      order by lower(o.name) = lower(q) desc, o.name ilike q || '%' desc,
               word_similarity(q, o.name) desc, o.name
      limit max_results;

  elsif p_kind = 'locations' then
    return query
      select l.id, l.slug, l.name,
             concat_ws(', ', l.street_address, l.town, l.state)
      from locations l
      where l.name ilike '%' || q || '%' or word_similarity(q, l.name) >= min_sim
      order by lower(l.name) = lower(q) desc, l.name ilike q || '%' desc,
               word_similarity(q, l.name) desc, l.name
      limit max_results;

  elsif p_kind = 'people' then
    return query
      select pe.id, pe.slug, pe.display_name,
             case when cr.n = 0 then 'No credits yet'
                  else cr.n || case when cr.n = 1 then ' credit' else ' credits' end
                       || coalesce(', most recently at ' || cr.org, '')
             end
      from people pe
      cross join lateral (
        -- One per production, however many roles they had in it
        select count(distinct c.production_id)::int as n,
               (select o.name
                  from credits c2
                  join productions p2 on p2.id = c2.production_id
                  join organizations o on o.id = p2.organization_id
                 where c2.person_id = pe.id
                 order by p2.year desc, p2.opening_date desc nulls last
                 limit 1) as org
        from credits c where c.person_id = pe.id
      ) cr
      where not pe.is_hidden
        and (pe.display_name ilike '%' || q || '%' or word_similarity(q, pe.display_name) >= min_sim)
      order by lower(pe.display_name) = lower(q) desc, pe.display_name ilike q || '%' desc,
               word_similarity(q, pe.display_name) desc, pe.display_name
      limit max_results;

  else
    raise exception 'lookup: unknown kind %', p_kind;
  end if;
end $$;
