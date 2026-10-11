-- =====================================================================
-- Local Theater Database: migration 0018
-- Bug reports from the footer's "Report a problem"
--
-- Anyone (signed in or not) can send a short report; the page address and
-- some technical details (browser, window size, recent page errors) come
-- with it. Moderators see them in Moderation > Bug reports and mark them
-- fixed or dismissed. Limits: 3 per minute per account, and 30 an hour
-- from signed-out visitors altogether.
-- Runs after 0017 (20261012030000_half_point_corrections.sql).
-- =====================================================================
create table bug_reports (
  id           uuid primary key default gen_random_uuid(),
  page_url     text not null check (length(page_url) <= 1000),
  message      text not null check (length(message) between 5 and 2000),
  details      jsonb not null default '{}',
  reported_by  uuid references profiles (id) on delete set null,
  status       text not null default 'open' check (status in ('open', 'fixed', 'dismissed')),
  created_at   timestamptz not null default now(),
  resolved_by  uuid references profiles (id) on delete set null,
  resolved_at  timestamptz
);
create index on bug_reports (status, created_at desc);
alter table bug_reports enable row level security;
create policy "moderators read bug reports" on bug_reports for select using (has_role('moderator'));

create or replace function report_bug(p_page_url text, p_message text, p_details jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(trim(coalesce(p_message, ''))) < 5 then raise exception 'Please describe what went wrong.'; end if;
  if is_banned() then raise exception 'Your account is suspended.'; end if;
  if auth.uid() is not null then
    if (select count(*) from bug_reports where reported_by = auth.uid() and created_at > now() - interval '1 minute') >= 3 then
      raise exception 'Thanks! Please wait a minute before sending another report.';
    end if;
  elsif (select count(*) from bug_reports where reported_by is null and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many reports right now. Please try again later, or sign in to report.';
  end if;
  insert into bug_reports (page_url, message, details, reported_by)
  values (left(coalesce(p_page_url, ''), 1000), left(trim(p_message), 2000),
          case when jsonb_typeof(p_details) = 'object' and length(p_details::text) <= 8000 then p_details else '{}' end,
          auth.uid());
end $$;

create or replace function resolve_bug(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('moderator') then raise exception 'Only moderators can do this'; end if;
  if p_status not in ('open', 'fixed', 'dismissed') then raise exception 'Unknown status'; end if;
  update bug_reports
     set status = p_status,
         resolved_by = case when p_status = 'open' then null else auth.uid() end,
         resolved_at = case when p_status = 'open' then null else now() end
   where id = p_id;
end $$;

revoke execute on function report_bug(text, text, jsonb), resolve_bug(uuid, text) from public;
grant execute on function report_bug(text, text, jsonb) to anon, authenticated;
grant execute on function resolve_bug(uuid, text) to authenticated;
