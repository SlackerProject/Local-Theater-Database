-- =====================================================================
-- Local Theater Database: migration 0015
-- recent_contributions(): count cast and crew only for production
-- submissions (corrections store their credit changes as an object, which
-- made the list fail).
-- Runs after 0014 (20261012000000_points_badges_hotlist_awards.sql).
-- =====================================================================
create or replace function recent_contributions(p_user uuid, p_limit int default 10)
returns table (amount int, reason text, earned_at timestamptz, kind text, entity_table text, entity_id uuid,
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
  left join edit_proposals ep on ep.id = pe.ref_id and pe.reason in ('production_approved', 'edit_approved')
  left join media m on m.id = pe.ref_id and pe.reason in ('poster_approved', 'photo_approved')
  where pe.user_id = p_user
  order by pe.created_at desc
  limit least(p_limit, 50);
$$;
