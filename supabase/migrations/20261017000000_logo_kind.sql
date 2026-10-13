-- =====================================================================
-- Local Theater Database: migration 0028
-- A new kind of upload: company logos
--
-- Only adds the enum value; PostgreSQL can't use a new enum value in the
-- same transaction that adds it, so 0029 does the rest.
-- Runs after 0027 (20261016000000_submission_roles.sql).
-- =====================================================================

alter type media_kind add value if not exists 'logo';
