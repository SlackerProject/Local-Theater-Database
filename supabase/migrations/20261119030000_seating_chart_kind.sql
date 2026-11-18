-- A new kind of upload: a venue's seating chart. Only adds the enum value;
-- PostgreSQL can't use a new enum value in the same transaction that adds
-- it, so the next migration does the rest.

alter type media_kind add value if not exists 'seating_chart';
