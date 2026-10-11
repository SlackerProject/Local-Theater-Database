-- =====================================================================
-- Local Theater Database: migration 0010
-- "Keep all" on the notifications page answers page changes only; show
-- announcements stay until the member acts on or dismisses each one.
-- Runs after 0009 (20261011020000_follows_calendar_announcements.sql).
-- =====================================================================
create or replace function keep_all_notifications() returns void
language sql security definer set search_path = public as $$
  update notifications set status = 'kept'
   where user_id = auth.uid() and kind = 'page_changed' and status = 'unread';
$$;
