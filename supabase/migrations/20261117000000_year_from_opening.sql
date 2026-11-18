-- A production's year is always the year of its opening night (not the
-- season). Whenever a production has an opening date, its year follows it.

create or replace function production_year_from_opening() returns trigger
language plpgsql as $$
begin
  if new.opening_date is not null then
    new.year := extract(year from new.opening_date)::smallint;
  end if;
  return new;
end;
$$;

drop trigger if exists productions_year_from_opening on productions;
create trigger productions_year_from_opening
  before insert or update of opening_date, year on productions
  for each row execute function production_year_from_opening();

-- Bring existing productions in line (The Crucible and Grease, both 2025)
update productions set year = extract(year from opening_date)::smallint
 where opening_date is not null and year <> extract(year from opening_date);

-- A typo'd performance: "Oct 30, year 6" was meant to be Oct 30, 2026, 7 PM
update performances
   set starts_at = timestamptz '2026-10-30 19:00 America/New_York'
 where starts_at < timestamptz '1800-01-01'
   and production_id = (select id from productions where slug = 'the-sound-of-music-riverside-theatre-works-2026')
   and not exists (select 1 from performances p2
                    where p2.production_id = performances.production_id
                      and p2.starts_at = timestamptz '2026-10-30 19:00 America/New_York');

-- No more impossible years on performances
alter table performances add constraint performances_sensible_year
  check (starts_at >= timestamptz '1800-01-01' and starts_at < timestamptz '2101-01-01') not valid;
alter table performances validate constraint performances_sensible_year;
