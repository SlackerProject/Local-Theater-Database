import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { showColors } from "@/lib/palette";
import { mediaUrl } from "@/lib/media";
import { currentTime, googleCalendarUrl, localDate, localDay, localTime } from "@/lib/calendar";
import {
  addDays,
  AuditionRowItem,
  dayOfWeek,
  GoingCard,
  MiniMonth,
  monthName,
  RunRow,
  shiftMonth,
  Week,
  type AuditionEvent,
  type Going,
  type Run,
} from "./parts";
import { siteOrigin } from "@/lib/site";
import { ANNOUNCEMENT_KINDS, ANNOUNCEMENT_SELECT, announcement, announcementContext, auditionOffer } from "@/lib/announcements";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { AnnouncementActions, AnnouncementText } from "@/components/Announcement";
import { CalendarFilters } from "./CalendarFilters";
import { PhoneCalendarLinks, SubscribeLink } from "./PhoneCalendar";

export const metadata: Metadata = { title: "Your calendar" };

export default function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-5 px-4 pb-16 pt-6 md:px-8 md:pt-10">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Calendar searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

type ProdRow = {
  id: string;
  slug: string;
  year: number;
  title_override: string | null;
  opening_date: string | null;
  closing_date: string | null;
  is_hidden: boolean;
  color_ground: string | null;
  color_ground_2: string | null;
  color_ink: string | null;
  color_soft: string | null;
  color_accent: string | null;
  color_edge: string | null;
  show: { title: string } | null;
  organization: { name: string } | null;
  location: { name: string; town: string | null } | null;
  poster: { thumb_key: string | null } | null;
  performances: { id: string; starts_at: string; is_cancelled: boolean }[];
};

const PROD_SELECT = `id, slug, year, title_override, opening_date, closing_date, is_hidden,
  color_ground, color_ground_2, color_ink, color_soft, color_accent, color_edge,
  show:shows(title), organization:organizations(name), location:locations(name, town),
  poster:media!productions_poster_fk(thumb_key), performances(id, starts_at, is_cancelled)`;

function toRun(p: ProdRow, followed: boolean, because: string | null): Run | null {
  if (!p.show || p.is_hidden) return null;
  const performances = p.performances
    .filter((x) => !x.is_cancelled)
    .map((x) => ({ id: x.id, date: localDate(x.starts_at), startsAt: x.starts_at as string | null }))
    .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!));
  const dates = performances.map((x) => x.date);
  const start = p.opening_date ?? dates[0];
  const end = p.closing_date ?? dates.at(-1) ?? start;
  if (!start || !end) return null;
  const showTitle = p.title_override ?? p.show.title;
  // Without a schedule yet, mark opening night so the run still shows up
  const nights = performances.length ? performances : [{ id: `${p.id}-opening`, date: start, startsAt: null }];
  return {
    id: p.id,
    slug: p.slug,
    title: `${showTitle} (${p.year})`,
    showTitle,
    company: p.organization?.name ?? "",
    start,
    end: end < start ? start : end,
    colors: showColors(p),
    followed,
    because,
    poster: mediaUrl(p.poster?.thumb_key),
    venue: p.location ? [p.location.name, p.location.town].filter(Boolean).join(", ") : null,
    nights,
  };
}

async function Calendar({ searchParams }: Pick<PageProps<"/calendar">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/calendar");
  const query = await searchParams;
  const supabase = await createClient();

  const today = localDate(currentTime());
  const month = typeof query.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month) ? query.month : today.slice(0, 7);
  const showPeople = query.people !== "0";
  const showCompanies = query.companies !== "0";

  // The grid: whole weeks, Sunday to Saturday, covering the month
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const gridStart = addDays(first, -dayOfWeek(first));
  const gridEnd = addDays(last, 6 - dayOfWeek(last));

  // ---- Your saved runs, and the nights you're going
  const [{ data: watch }, { data: follows }, { data: news }, { data: auditionFollows }] = await Promise.all([
    supabase.from("watch_list").select(`status, performance_id, production:productions(${PROD_SELECT})`).eq("user_id", user.id),
    supabase
      .from("follows")
      .select("person_id, organization_id, person:people(display_name)")
      .eq("user_id", user.id),
    supabase
      .from("notifications")
      .select(ANNOUNCEMENT_SELECT)
      .eq("user_id", user.id)
      .in("kind", [...ANNOUNCEMENT_KINDS])
      .eq("status", "unread")
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("audition_follows")
      .select("production:productions(slug, year, title_override, is_hidden, show:shows(title), auditions(id, starts_at, label, place, venue:locations(name)))")
      .eq("user_id", user.id),
  ]);

  // ---- Audition sessions you asked to be reminded about
  const auditionEvents: AuditionEvent[] = (auditionFollows ?? []).flatMap((f) => {
    const p = f.production;
    if (!p?.show || p.is_hidden) return [];
    const showTitle = p.title_override ?? p.show.title;
    return (p.auditions ?? []).map((a) => ({
      id: a.id,
      slug: p.slug,
      title: `${showTitle} (${p.year})`,
      showTitle,
      date: localDate(a.starts_at),
      startsAt: a.starts_at,
      label: a.label ?? "Auditions",
      place: a.venue?.name ?? a.place,
    }));
  });
  const auditionsInGrid = auditionEvents.filter((a) => a.date >= gridStart && a.date <= gridEnd);
  const ctx = await announcementContext(
    supabase,
    user.id,
    (news ?? []).flatMap((n) => (n.production ? [n.production.id] : [])),
  );

  const savedRuns: Run[] = [];
  const going: Going[] = [];
  for (const w of watch ?? []) {
    const p = w.production as ProdRow | null;
    if (!p) continue;
    const run = toRun(p, false, null);
    if (!run) continue;
    savedRuns.push(run);
    const pf = w.status === "going" && p.performances.find((x) => x.id === w.performance_id);
    if (pf) going.push({ performanceId: pf.id, run, date: localDate(pf.starts_at), startsAt: pf.starts_at });
  }
  const savedIds = new Set(savedRuns.map((r) => r.id));

  // ---- Runs involving people or companies you follow (dashed), this month
  const personIds = (follows ?? []).flatMap((f) => (f.person_id ? [f.person_id] : []));
  const orgIds = (follows ?? []).flatMap((f) => (f.organization_id ? [f.organization_id] : []));
  const names = new Map((follows ?? []).flatMap((f) => (f.person_id && f.person ? [[f.person_id, f.person.display_name] as const] : [])));
  const followed = new Map<string, Run>();
  const [{ data: byPeople }, { data: byCompanies }] = await Promise.all([
    showPeople && personIds.length
      ? supabase
          .from("credits")
          .select(`person_id, production:productions!inner(${PROD_SELECT})`)
          .in("person_id", personIds)
          .lte("production.opening_date", gridEnd)
          .gte("production.closing_date", gridStart)
      : Promise.resolve({ data: [] }),
    showCompanies && orgIds.length
      ? supabase.from("productions").select(PROD_SELECT).in("organization_id", orgIds).lte("opening_date", gridEnd).gte("closing_date", gridStart)
      : Promise.resolve({ data: [] }),
  ]);
  for (const c of (byPeople ?? []) as { person_id: string; production: ProdRow | null }[]) {
    if (!c.production || savedIds.has(c.production.id)) continue;
    const existing = followed.get(c.production.id);
    if (existing) continue;
    const run = toRun(c.production, true, names.get(c.person_id) ? `${names.get(c.person_id)} is in this` : null);
    if (run) followed.set(run.id, run);
  }
  for (const p of (byCompanies ?? []) as ProdRow[]) {
    if (savedIds.has(p.id) || followed.has(p.id)) continue;
    const run = toRun(p, true, null);
    if (run) followed.set(run.id, run);
  }

  const inGrid = (r: Run) => r.start <= gridEnd && r.end >= gridStart;
  const inMonth = (r: Run) => r.start <= last && r.end >= first;
  const runs = [...savedRuns.filter(inGrid), ...[...followed.values()].filter(inGrid)].sort(
    (a, b) => a.start.localeCompare(b.start) || Number(a.followed) - Number(b.followed),
  );
  const goingThisGrid = going.filter((g) => g.date >= gridStart && g.date <= gridEnd);

  // ---- Sidebar: your next show
  const now = currentTime().toISOString();
  const next = going.filter((g) => g.startsAt >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
  const origin = await siteOrigin();
  const nextLinks = next && {
    google: googleCalendarUrl({
      id: next.performanceId,
      startsAt: next.startsAt,
      title: next.run.title,
      company: next.run.company,
      venue: next.run.venue,
      url: `${origin}/production/${next.run.slug}`,
    }),
    ics: `/calendar/performance/${next.performanceId}`,
  };

  // ---- Navigation keeps the filter choices
  const href = (m: string | null) => {
    const q = new URLSearchParams();
    if (m) q.set("month", m);
    if (!showPeople) q.set("people", "0");
    if (!showCompanies) q.set("companies", "0");
    const s = q.toString();
    return s ? `/calendar?${s}` : "/calendar";
  };

  const weeks: string[][] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));

  const monthRuns = runs.filter(inMonth);
  const monthGoing = going.filter((g) => g.date >= first && g.date <= last).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const monthAuditions = auditionEvents
    .filter((a) => a.date >= first && a.date <= last)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <>
      {/* Title and month navigation. The arrows never move as the month's
          name changes length: pinned right on phones, first on desktop. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="order-1 m-0 text-[30px] font-extrabold leading-none tracking-[-0.02em] md:order-2 md:text-[40px]">{monthName(month)}</h1>
        <div className="order-2 ml-auto flex items-center gap-2 md:order-1 md:ml-0">
          <Link href={href(shiftMonth(month, -1))} aria-label="Previous month" className="link-quiet flex h-11 w-11 items-center justify-center rounded-lg border-[1.5px] border-rule">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
          <Link href={href(shiftMonth(month, 1))} aria-label="Next month" className="link-quiet flex h-11 w-11 items-center justify-center rounded-lg border-[1.5px] border-rule">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
          <Link href={href(null)} className="btn-text px-2 no-underline">
            Today
          </Link>
        </div>
      </div>

      {/* Legend (desktop) */}
      <div className="hidden flex-wrap gap-x-6 gap-y-2 text-sm md:flex">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-3.5 w-7 rounded-[3px] border" style={{ background: "#F3E0C8", borderColor: "#978B7C" }} />
          Performances of shows you saved, in each poster’s colors
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-3.5 w-7 rounded-[3px] border-2 border-ink" style={{ background: "#F3E0C8" }} />
          The night you’re going
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-3.5 w-7 rounded-[3px] border-[1.5px] border-dashed border-[#A8A8A8]" />
          Shows with people you follow
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-3.5 w-7 rounded-[3px] border border-dotted border-ink bg-soft" />
          Auditions you’re watching
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-10">
        <div className="min-w-0 flex-[999_1_640px]">
          {/* Desktop month grid */}
          <div className="hidden overflow-hidden rounded-lg border border-rule md:block">
            <div className="grid grid-cols-7">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="px-2.5 py-2 text-[13px] font-bold text-muted">
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <Week key={week[0]} week={week} month={month} today={today} runs={runs} going={goingThisGrid} auditions={auditionsInGrid} />
            ))}
          </div>

          {/* Phone: compact month with dots, then lists */}
          <div className="md:hidden">
            <MiniMonth weeks={weeks} month={month} today={today} runs={runs} going={going} auditions={auditionsInGrid} />
            <section className="mt-6 flex flex-col gap-3">
              <h2 className="subheading">You’re going</h2>
              {monthGoing.length ? (
                monthGoing.map((g) => <GoingCard key={g.performanceId} g={g} />)
              ) : (
                <p className="m-0 text-[15px] text-muted">
                  Nothing this month. On a production page, open All performances and choose “I’m going”.
                </p>
              )}
            </section>
            <section className="mt-7 flex flex-col">
              <h2 className="subheading mb-1">Running this month</h2>
              {monthRuns.length ? (
                monthRuns.map((r) => <RunRow key={r.id} r={r} />)
              ) : (
                <p className="m-0 text-[15px] text-muted">Shows you save, and shows with people you follow, will appear here.</p>
              )}
            </section>
            {monthAuditions.length > 0 && (
              <section className="mt-7 flex flex-col">
                <h2 className="subheading mb-1">Auditions this month</h2>
                {monthAuditions.map((a) => (
                  <AuditionRowItem key={a.id} a={a} />
                ))}
              </section>
            )}
          </div>

          {runs.length === 0 && auditionsInGrid.length === 0 && (
            <p className="mt-4 hidden text-muted md:block">
              Nothing on your calendar this month. Press “Want to see” on a production page, or follow people and companies,
              and their runs will appear here.
            </p>
          )}
        </div>

        {/* Sidebar */}
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="subheading">Your next show</h2>
            {next && nextLinks ? (
              <>
                <Link href={`/production/${next.run.slug}`} className="link-quiet flex items-start gap-3.5">
                  {next.run.poster ? (
                    <img src={next.run.poster} alt={`${next.run.showTitle} poster`} className="w-[84px] flex-none rounded-[4px]" />
                  ) : (
                    <span aria-hidden="true" className="flex aspect-[4/5] w-[84px] flex-none items-center justify-center rounded-[4px] border border-rule bg-soft p-1.5 text-center text-xs font-extrabold text-muted">
                      {next.run.showTitle}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-bold">{next.run.title}</span>
                    <span className="text-[15px]">
                      {localDay(next.startsAt)} · {localTime(next.startsAt)}
                    </span>
                    {next.run.venue && <span className="text-sm text-muted">{next.run.venue}</span>}
                  </span>
                </Link>
                <PhoneCalendarLinks google={nextLinks.google} ics={nextLinks.ics} />
              </>
            ) : (
              <p className="m-0 text-[15px] text-muted">
                When you choose “I’m going” for a performance, it will appear here with a way to add it to your phone.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="subheading">New from people you follow</h2>
            {news?.length ? (
              <div className="flex flex-col border-y border-rule">
                {news.map((n) => {
                  const a = announcement(n);
                  if (!a) return null;
                  return (
                    <div key={n.id} className="flex flex-col gap-2.5 border-b border-rule py-3.5 last:border-b-0">
                      <AnnouncementText a={a} />
                      <AnnouncementActions
                        id={n.id}
                        kind={a.kind}
                        productionId={a.productionId}
                        productionHref={a.production.href}
                        saved={savedIds.has(a.productionId)}
                        auditions={auditionOffer(a.kind, a.productionId, ctx)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="m-0 text-[15px] text-muted">Nothing new. Follow people and companies to hear when they’re in a show.</p>
            )}
            <Link href="/notifications" className="self-start text-[15px] font-semibold">
              All notifications
            </Link>
          </section>

          <section className="flex flex-col gap-1">
            <h2 className="subheading mb-1">Show on calendar</h2>
            <CalendarFilters people={showPeople} companies={showCompanies} month={query.month ? month : null} />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="subheading">Subscribe in your calendar app</h2>
            <p className="m-0 text-[15px] text-muted">
              A private link that keeps every performance you’re going to in your phone’s calendar, updated automatically.
            </p>
            <SubscribeLink />
          </section>
        </aside>
      </div>
    </>
  );
}

