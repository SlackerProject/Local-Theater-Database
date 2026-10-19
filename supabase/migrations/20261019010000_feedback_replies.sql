-- =====================================================================
-- Local Theater Database: migration 0032
-- Replying to feedback
--
--   * feedback_messages: a conversation under each piece of feedback.
--     Moderators write back; the sender can answer.
--   * reply_to_feedback(): a moderator's reply. The sender gets a
--     'feedback_reply' notification (one unread per feedback). Feedback
--     sent while signed out has no one to reply to.
--   * answer_feedback(): the sender writes back. Feedback marked done or
--     dismissed is reopened so a moderator sees it.
--   * Senders can read their own feedback and its conversation.
-- Runs after 0031 (20261019000000_feedback.sql).
-- =====================================================================

create table feedback_messages (
  id              uuid primary key default gen_random_uuid(),
  bug_report_id   uuid not null references bug_reports (id) on delete cascade,
  author_id       uuid references profiles (id) on delete set null,
  from_moderator  boolean not null,
  body            text not null check (length(body) between 1 and 2000),
  created_at      timestamptz not null default now()
);
create index on feedback_messages (bug_report_id, created_at);
alter table feedback_messages enable row level security;
create policy "moderators and the sender read feedback messages" on feedback_messages for select
  using (has_role('moderator') or exists (select 1 from bug_reports b where b.id = bug_report_id and b.reported_by = auth.uid()));

create policy "senders read their own feedback" on bug_reports for select using (reported_by = auth.uid());

alter table notifications add column bug_report_id uuid references bug_reports (id) on delete cascade;
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('page_changed', 'cast_announcement', 'company_announcement', 'auditions_announced', 'site_update', 'feedback_reply'));
create unique index notifications_one_unread_feedback_reply
  on notifications (user_id, bug_report_id) where kind = 'feedback_reply' and status = 'unread';

create or replace function reply_to_feedback(p_id uuid, p_body text, p_done boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sender uuid;
begin
  if not has_role('moderator') then raise exception 'Only moderators can do this'; end if;
  if length(trim(coalesce(p_body, ''))) < 1 then raise exception 'Write a reply first.'; end if;
  select reported_by into v_sender from bug_reports where id = p_id;
  if not found then raise exception 'That feedback no longer exists.'; end if;
  if v_sender is null then raise exception 'This was sent while signed out, so there’s no one to reply to.'; end if;

  insert into feedback_messages (bug_report_id, author_id, from_moderator, body)
  values (p_id, auth.uid(), true, left(trim(p_body), 2000));

  if v_sender <> auth.uid() then
    insert into notifications (user_id, kind, bug_report_id)
    values (v_sender, 'feedback_reply', p_id)
    on conflict (user_id, bug_report_id) where kind = 'feedback_reply' and status = 'unread'
    do update set created_at = now();
  end if;

  if p_done then
    update bug_reports set status = 'fixed', resolved_by = auth.uid(), resolved_at = now() where id = p_id and status = 'open';
  end if;
end $$;

create or replace function answer_feedback(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if is_banned() then raise exception 'Your account is suspended.'; end if;
  if length(trim(coalesce(p_body, ''))) < 1 then raise exception 'Write a reply first.'; end if;
  if not exists (select 1 from bug_reports where id = p_id and reported_by = auth.uid()) then
    raise exception 'That feedback isn’t yours.';
  end if;
  if (select count(*) from feedback_messages where author_id = auth.uid() and not from_moderator
        and created_at > now() - interval '1 minute') >= 3 then
    raise exception 'Please wait a minute before sending more.';
  end if;

  insert into feedback_messages (bug_report_id, author_id, from_moderator, body)
  values (p_id, auth.uid(), false, left(trim(p_body), 2000));
  update bug_reports set status = 'open', resolved_by = null, resolved_at = null where id = p_id and status <> 'open';
  -- Their reply answers the moderator's message
  update notifications set status = 'read'
   where user_id = auth.uid() and bug_report_id = p_id and kind = 'feedback_reply' and status = 'unread';
end $$;

revoke execute on function reply_to_feedback(uuid, text, boolean), answer_feedback(uuid, text) from public, anon;
grant execute on function reply_to_feedback(uuid, text, boolean), answer_feedback(uuid, text) to authenticated;
