-- =====================================================================
-- Local Theater Database: migration 0031
-- "Give feedback" (was "Report a problem")
--
--   * bug_reports.kind: what the feedback is about:
--       bug      Something's broken
--       idea     An idea or feature request
--       content  Wrong or missing information
--       other    Other feedback
--     Older reports are bugs.
--   * send_feedback(): like report_bug(), with the kind. report_bug() stays
--     for pages still open from before (it files a bug).
--   * set_feedback_kind(): moderators re-sort feedback filed under the
--     wrong kind.
-- Runs after 0030 (20261018000000_young_performers.sql).
-- =====================================================================

alter table bug_reports
  add column kind text not null default 'bug' check (kind in ('bug', 'idea', 'content', 'other'));
create index on bug_reports (kind, status, created_at desc);

create or replace function send_feedback(p_kind text, p_page_url text, p_message text, p_details jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('bug', 'idea', 'content', 'other') then raise exception 'Choose what your feedback is about.'; end if;
  if length(trim(coalesce(p_message, ''))) < 5 then raise exception 'Please write a few words.'; end if;
  if is_banned() then raise exception 'Your account is suspended.'; end if;
  if auth.uid() is not null then
    if (select count(*) from bug_reports where reported_by = auth.uid() and created_at > now() - interval '1 minute') >= 3 then
      raise exception 'Thanks! Please wait a minute before sending more.';
    end if;
  elsif (select count(*) from bug_reports where reported_by is null and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too much feedback right now. Please try again later, or sign in to send it.';
  end if;
  insert into bug_reports (kind, page_url, message, details, reported_by)
  values (p_kind, left(coalesce(p_page_url, ''), 1000), left(trim(p_message), 2000),
          case when jsonb_typeof(p_details) = 'object' and length(p_details::text) <= 8000 then p_details else '{}' end,
          auth.uid());
end $$;

create or replace function set_feedback_kind(p_id uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('moderator') then raise exception 'Only moderators can do this'; end if;
  if p_kind not in ('bug', 'idea', 'content', 'other') then raise exception 'Unknown kind'; end if;
  update bug_reports set kind = p_kind where id = p_id;
end $$;

revoke execute on function send_feedback(text, text, text, jsonb), set_feedback_kind(uuid, text) from public;
grant execute on function send_feedback(text, text, text, jsonb) to anon, authenticated;
grant execute on function set_feedback_kind(uuid, text) to authenticated;
