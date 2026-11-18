-- The typed Season and the company Access note were replaced (season is
-- worked out from productions; access lives on the venue). Both were empty,
-- and the site no longer reads them.
alter table organizations drop column season_note, drop column access_note;
