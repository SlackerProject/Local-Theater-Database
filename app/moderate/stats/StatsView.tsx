import Link from "next/link";

export type StatsData = {
  members: {
    total: number;
    new_7d: number;
    new_30d: number;
    signed_in_7d: number;
    signed_in_30d: number;
    suspended: number;
    claimed_pages: number;
    by_role: Record<string, number> | null;
  };
  content: {
    productions: number;
    productions_upcoming: number;
    productions_new_30d: number;
    people: number;
    people_new_30d: number;
    companies: number;
    companies_new_30d: number;
    shows: number;
    venues: number;
    credits: number;
    performances_upcoming: number;
    photos: number;
    productions_with_poster: number;
    auditions_upcoming: number;
    awards: number;
  };
  engagement: { follows: number; want_to_see: number; going: number; seen: number; audition_reminders: number };
  activity: {
    edits_7d: number;
    edits_30d: number;
    contributors_30d: number;
    approved_30d: number;
    rejected_30d: number;
    review_hours: number | null;
    waiting: number;
    feedback_open: number;
  };
  visitors: { day: string; visitors: number; views: number }[];
  weekly: { week: string; members: number; productions: number; people: number; edits: number }[];
  top_contributors: { name: string; username: string; edits: number }[];
  top_companies: { name: string; slug: string; productions: number }[];
  by_year: { year: number; productions: number }[];
};

const n = (x: number | null | undefined) => (x ?? 0).toLocaleString("en-US");
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");
const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

export function StatsView({ s }: { s: StatsData }) {
  const { members: m, content: c, engagement: e, activity: a } = s;
  const week = s.visitors.slice(-7);
  const visitorsThisWeek = week.reduce((t, d) => t + d.visitors, 0);
  const viewsThisWeek = week.reduce((t, d) => t + d.views, 0);

  return (
    <>
      <p className="-mt-4 m-0 text-[15px] text-muted">
        Counted live each time this page opens.
        {(a.waiting > 0 || a.feedback_open > 0) && (
          <>
            {" "}
            Right now: <Link href="/moderate">{n(a.waiting)} waiting for review</Link> ·{" "}
            <Link href="/moderate/bugs">{n(a.feedback_open)} open feedback</Link>.
          </>
        )}
      </p>

      <Group title="Members">
        <Stat label="Members" value={m.total} sub={`+${n(m.new_7d)} this week · +${n(m.new_30d)} in 30 days`} />
        <Stat label="Signed in, last 7 days" value={m.signed_in_7d} sub={`${n(m.signed_in_30d)} in the last 30 days`} />
        <Stat label="Claimed person pages" value={m.claimed_pages} sub={`${pct(m.claimed_pages, m.total)} of members`} />
        <Stat
          label="Roles"
          value={(m.by_role?.moderator ?? 0) + (m.by_role?.admin ?? 0)}
          sub={`moderators and admin · ${n(m.by_role?.trusted)} trusted editors${m.suspended ? ` · ${n(m.suspended)} suspended` : ""}`}
        />
      </Group>

      <Group title="The database">
        <Stat label="Productions" value={c.productions} sub={`${n(c.productions_upcoming)} running or coming up · +${n(c.productions_new_30d)} in 30 days`} />
        <Stat label="People" value={c.people} sub={`+${n(c.people_new_30d)} in 30 days`} />
        <Stat label="Companies" value={c.companies} sub={`+${n(c.companies_new_30d)} in 30 days`} />
        <Stat label="Shows" value={c.shows} sub={`${n(c.venues)} venues`} />
        <Stat label="Cast and crew credits" value={c.credits} sub={c.productions ? `about ${Math.round(c.credits / c.productions)} per production` : undefined} />
        <Stat label="Photos, posters and headshots" value={c.photos} sub={`${pct(c.productions_with_poster, c.productions)} of productions have a poster`} />
        <Stat label="Upcoming performances" value={c.performances_upcoming} sub={`${n(c.auditions_upcoming)} productions with auditions coming up`} />
        <Stat label="Award entries" value={c.awards} />
      </Group>

      <Group title="Contributions, last 30 days">
        <Stat label="Edits" value={a.edits_30d} sub={`${n(a.edits_7d)} this week`} />
        <Stat label="Contributors" value={a.contributors_30d} sub="members who edited or sent something in" />
        <Stat label="Reviewed" value={a.approved_30d + a.rejected_30d} sub={`${n(a.approved_30d)} approved · ${n(a.rejected_30d)} rejected`} />
        <Stat
          label="Typical wait for review"
          text={a.review_hours === null ? "–" : a.review_hours < 1 ? `${Math.round(a.review_hours * 60)} min` : `${a.review_hours} hr`}
          sub="half of reviews were quicker than this"
        />
      </Group>

      <Group title="Members’ shows and follows">
        <Stat label="Follows" value={e.follows} sub="people and companies followed" />
        <Stat label="Seen" value={e.seen} sub="productions marked seen" />
        <Stat label="Want to see / Going" value={e.want_to_see + e.going} sub={`${n(e.want_to_see)} want to see · ${n(e.going)} going`} />
        <Stat label="Audition reminders" value={e.audition_reminders} />
      </Group>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="heading">
          Visitors, last 14 days{" "}
          <span className="text-base font-semibold text-muted">
            {s.visitors.length ? `${dayLabel(s.visitors[0].day, { month: "short", day: "numeric" })} – ${dayLabel(s.visitors[s.visitors.length - 1].day, { month: "short", day: "numeric" })}` : ""}
          </span>
        </h2>
        <p className="m-0 text-[15px] text-muted">
          Different visitors each day to production, person and show pages (the Hotlist’s count).{" "}
          <strong className="text-ink">{n(visitorsThisWeek)}</strong> visitor-days and <strong className="text-ink">{n(viewsThisWeek)}</strong> page
          views in the last 7 days.
        </p>
        <Bars
          rows={s.visitors.map((d) => ({ key: d.day, label: dayLabel(d.day, { day: "numeric" }), value: d.visitors, title: `${dayLabel(d.day, { weekday: "short", month: "short", day: "numeric" })}: ${n(d.visitors)} visitors · ${n(d.views)} page views` }))}
        />
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="heading">Growth, last 12 weeks</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[15px] tabular-nums">
            <thead>
              <tr className="border-b-2 border-ink text-left">
                <th scope="col" className="py-1.5 pr-3">Week of</th>
                <th scope="col" className="py-1.5 pr-3 text-right">New members</th>
                <th scope="col" className="py-1.5 pr-3 text-right">New productions</th>
                <th scope="col" className="py-1.5 pr-3 text-right">New people</th>
                <th scope="col" className="py-1.5 text-right">Edits</th>
              </tr>
            </thead>
            <tbody>
              {[...s.weekly].reverse().map((w) => (
                <tr key={w.week} className="border-b border-rule">
                  <td className="py-1.5 pr-3">{dayLabel(w.week, { month: "short", day: "numeric", year: "numeric" })}</td>
                  <td className="py-1.5 pr-3 text-right">{n(w.members)}</td>
                  <td className="py-1.5 pr-3 text-right">{n(w.productions)}</td>
                  <td className="py-1.5 pr-3 text-right">{n(w.people)}</td>
                  <td className="py-1.5 text-right">{n(w.edits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-10 md:grid-cols-3">
        <Ranked
          title="Top contributors, 30 days"
          empty="No edits yet."
          rows={s.top_contributors.map((t) => ({ key: t.username, label: <Link href={`/moderate/members?q=${encodeURIComponent(t.username)}`}>{t.name}</Link>, value: `${n(t.edits)} edits` }))}
        />
        <Ranked
          title="Companies with the most productions"
          empty="No productions yet."
          rows={s.top_companies.map((t) => ({ key: t.slug, label: <Link href={`/company/${t.slug}`}>{t.name}</Link>, value: n(t.productions) }))}
        />
        <Ranked title="Productions by year" empty="No productions yet." rows={s.by_year.map((y) => ({ key: String(y.year), label: String(y.year), value: n(y.productions) }))} />
      </div>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="heading">{title}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, text, sub }: { label: string; value?: number; text?: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-rule p-4">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <span className="text-[32px] font-extrabold leading-tight tabular-nums tracking-[-0.02em]">{text ?? n(value)}</span>
      {sub && <span className="text-[13px] leading-snug text-muted">{sub}</span>}
    </div>
  );
}

// A simple bar chart: one column per row, the number on top
function Bars({ rows }: { rows: { key: string; label: string; value: number; title: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="m-0 flex h-[180px] list-none items-end gap-1 p-0 md:gap-2" aria-label="Visitors per day">
      {rows.map((r) => (
        <li key={r.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={r.title}>
          <span className="text-[12px] font-semibold tabular-nums">{r.value}</span>
          <span className="w-full rounded-t-[3px] bg-ink" style={{ height: `${Math.max(2, (r.value / max) * 120)}px` }} aria-hidden="true" />
          <span className="text-center text-[11px] text-muted">{r.label}</span>
          <span className="sr-only">{r.title}</span>
        </li>
      ))}
    </ol>
  );
}

function Ranked({ title, empty, rows }: { title: string; empty: string; rows: { key: string; label: React.ReactNode; value: string }[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="subheading">{title}</h2>
      {rows.length ? (
        <ol className="m-0 list-none border-t border-rule p-0 text-[15px]">
          {rows.map((r) => (
            <li key={r.key} className="flex items-baseline justify-between gap-3 border-b border-rule py-1.5">
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="flex-none tabular-nums text-muted">{r.value}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-muted">{empty}</p>
      )}
    </section>
  );
}
