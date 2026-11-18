import type { Metadata } from "next";
import Link from "next/link";
import { forwardIfMerged } from "@/lib/merged";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ProductionsByYear, TileGrid, type ProductionTile } from "@/components/ProductionsByYear";
import { PosterTile } from "@/components/PosterTile";
import { mediaUrl } from "@/lib/media";
import { getCurrentUser } from "@/lib/auth";
import { FollowButton } from "@/components/FollowButton";
import { ModeratorDeleteSection } from "@/components/ModeratorDeleteSection";
import { EditButton, SuggestEdit } from "@/components/SuggestEdit";
import { CompanyLogo } from "@/components/CompanyLogo";
import { LogoUploader } from "@/components/uploads/UploadPanels";
import { SHOW_COMPANY_LOGOS, SITE_NAME } from "@/lib/brand";
import { shortRun } from "@/lib/runDates";
import { currentTime, localDate, localDay, localTime } from "@/lib/calendar";
import { AWARD_SELECT, sortAwards, type AwardRow } from "@/lib/awards";
import { AwardList } from "@/components/AwardList";
import { ReadMore, RemindMe, WantToSee } from "./CompanyActions";

// Browser tab and shared links: "Company · Town · Local Theater Database"
export async function generateMetadata({ params }: PageProps<"/company/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("name, town, description").eq("slug", slug).maybeSingle();
  if (!org) return { title: "Company" };
  const title = [org.name, org.town].filter(Boolean).join(" · ");
  const description = org.description || `Productions by ${org.name}${org.town ? ` in ${org.town}` : ""}.`;
  return { title, description, openGraph: { type: "website", siteName: SITE_NAME, url: `/company/${slug}`, title, description }, twitter: { card: "summary", title, description } };
}

export default function CompanyPage({ params, searchParams }: PageProps<"/company/[slug]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-12 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Company params={params} searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const SOCIAL = [
  {
    key: "facebook_url",
    label: "Facebook",
    path: "M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v9h4v-9h3l.5-4h-3.5V9c0-.6.4-1 1-1z",
  },
  {
    key: "instagram_url",
    label: "Instagram",
    path: "M12 7.3A4.7 4.7 0 1 0 12 16.7 4.7 4.7 0 0 0 12 7.3zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm4.9-8.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM20 4H4v16h16V4zm-1.8 14.2H5.8V5.8h12.4v12.4z",
  },
  {
    key: "youtube_url",
    label: "YouTube",
    path: "M22 8.2c-.2-1.5-1-2.5-2.5-2.7C17.2 5.2 12 5.2 12 5.2s-5.2 0-7.5.3C3 5.7 2.2 6.7 2 8.2 1.8 9.5 1.8 12 1.8 12s0 2.5.2 3.8c.2 1.5 1 2.5 2.5 2.7 2.3.3 7.5.3 7.5.3s5.2 0 7.5-.3c1.5-.2 2.3-1.2 2.5-2.7.2-1.3.2-3.8.2-3.8s0-2.5-.2-3.8zM10 15.1V8.9l5.2 3.1-5.2 3.1z",
  },
] as const;

// Get involved: links only, in this order
const INVOLVED = [
  { key: "membership_url", label: "Membership" },
  { key: "volunteer_url", label: "Volunteer" },
  { key: "house_staff_url", label: "House staff" },
  { key: "newsletter_url", label: "Newsletter" },
  { key: "donate_url", label: "Support us" },
] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

// "$30 Musicals" or "Musicals: $30" -> { label: "Musicals", price: "$30" };
// anything else stays as typed
function priceLines(text: string | null) {
  return (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const front = l.match(/^\$\s*(\d+(?:\.\d{2})?)\s*[-–:·]?\s*(.+)$/);
      if (front) return { label: front[2], price: `$${front[1]}` };
      const back = l.match(/^(.+?)\s*[-–:·]?\s*\$\s*(\d+(?:\.\d{2})?)$/);
      if (back) return { label: back[1], price: `$${back[2]}` };
      return { label: l, price: "" };
    });
}


// The usual season, from the last three years of opening nights:
// "3 shows a year · Sep–May". The months run the long way round the
// calendar, skipping the longest quiet stretch (often summer).
function seasonOf(openings: string[], today: string): string | null {
  const from = `${Number(today.slice(0, 4)) - 3}${today.slice(4)}`;
  const recent = openings.filter((d) => d > from && d <= today).sort();
  if (recent.length < 2) return null;
  const years = Math.min(3, Math.max(1, Math.ceil((Date.parse(today) - Date.parse(recent[0])) / (365 * 864e5))));
  const perYear = Math.max(1, Math.round(recent.length / years));
  const months = [...new Set(recent.map((d) => Number(d.slice(5, 7)) - 1))].sort((a, b) => a - b);
  let span = MONTHS[months[0]];
  if (months.length > 1) {
    // The biggest gap between months that have openings, going round the year
    let gapAfter = months.length - 1;
    let gap = months[0] + 12 - months[months.length - 1];
    for (let i = 0; i < months.length - 1; i++) {
      if (months[i + 1] - months[i] > gap) {
        gap = months[i + 1] - months[i];
        gapAfter = i;
      }
    }
    span = `${MONTHS[months[(gapAfter + 1) % months.length]]}–${MONTHS[months[gapAfter]]}`;
  }
  return `${perYear} show${perYear === 1 ? "" : "s"} a year · ${span}`;
}

// "Reservoir Stage · 888 South Main St, Mansfield"
const stageLine = (v: { stage_name: string | null; street_address: string | null; town: string | null }) =>
  [v.stage_name, [v.street_address, v.town].filter(Boolean).join(", ")].filter(Boolean).join(" · ");

async function Company({ params, searchParams }: Pick<PageProps<"/company/[slug]">, "params" | "searchParams">) {
  const [{ slug }, { program: programParam }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select(
      `id, name, town, state, website_url, founded_year, description, is_nonprofit, ticket_price, ticket_prices, pass_price, pass_shows,
       audition_style, tickets_url,
       facebook_url, instagram_url, youtube_url, membership_url, volunteer_url, house_staff_url, newsletter_url, donate_url,
       home:locations!organizations_home_location_id_fkey(slug, name, town, stage_name, street_address, seating_capacity, seating_style,
                                                          accessibility, chart:media!locations_seating_chart_fk(id)),
       programs:company_programs(id, slug, name, for_kids),
       logo:media!organizations_logo_fk(thumb_key, storage_key, photographer_credit),
       productions(id, slug, year, title_override, opening_date, closing_date, ticket_url, is_hidden, color_ground, program_id,
                   poster:media!productions_poster_fk(thumb_key),
                   show:shows(title), location:locations(slug, name, town, stage_name, street_address),
                   auditions(id, starts_at, label, place, venue:locations(name)))`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!org) return forwardIfMerged("organizations", slug);

  const user = await getCurrentUser();
  const productions = (org.productions ?? []).filter((p) => p.show && !p.is_hidden);
  const ids = productions.map((p) => p.id);
  const path = `/company/${slug}`;

  const [{ data: followers }, { data: myFollow }, { count: myPendingLogos }, { data: showAwards }, { data: ownAwards }, { data: watching }, { data: reminders }] =
    await Promise.all([
      supabase.rpc("follower_count", { p_organization_id: org.id }),
      user
        ? supabase.from("follows").select("id").eq("user_id", user.id).eq("organization_id", org.id).maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase.from("media").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("uploaded_by", user.id).eq("status", "pending")
        : Promise.resolve({ count: 0 }),
      ids.length ? supabase.from("award_entries").select(AWARD_SELECT).in("production_id", ids) : Promise.resolve({ data: [] }),
      supabase.from("award_entries").select(AWARD_SELECT).eq("organization_id", org.id),
      user && ids.length
        ? supabase.from("watch_list").select("production_id, status").eq("user_id", user.id).in("production_id", ids)
        : Promise.resolve({ data: [] }),
      user && ids.length
        ? supabase.from("audition_follows").select("production_id").eq("user_id", user.id).in("production_id", ids)
        : Promise.resolve({ data: [] }),
    ]);

  // Awards: everything its productions earned, plus its own honors
  const seen = new Set<string>();
  const awards = sortAwards(
    ([...(showAwards ?? []), ...(ownAwards ?? [])] as unknown as AwardRow[]).filter((a) => !seen.has(a.id) && !!seen.add(a.id)),
  );

  const now = currentTime();
  const today = localDate(now);
  const in120 = localDate(new Date(now.getTime() + 120 * 864e5));
  const title = (p: (typeof productions)[number]) => p.title_override ?? p.show!.title;

  // On stage now: running today, or the next one opening within 120 days
  const running = productions.find((p) => p.opening_date && p.opening_date <= today && (p.closing_date ?? p.opening_date) >= today);
  const next = productions
    .filter((p) => p.opening_date && p.opening_date > today && p.opening_date <= in120)
    .sort((a, b) => a.opening_date!.localeCompare(b.opening_date!))[0];
  const onStage = running ?? next;
  const wantToSee = new Set((watching ?? []).filter((w) => w.status === "want_to_see").map((w) => w.production_id));
  const reminded = new Set((reminders ?? []).map((r) => r.production_id));

  // Auditions coming up, each production at its next session
  const auditions = productions
    .flatMap((p) => {
      const upcoming = (p.auditions ?? []).filter((a) => a.starts_at >= now.toISOString()).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      return upcoming.length ? [{ p, next: upcoming[0], more: upcoming.length - 1 }] : [];
    })
    .sort((a, b) => a.next.starts_at.localeCompare(b.next.starts_at));

  // Programs with productions to show (programs for kids are never listed);
  // choosing one shows only its posters
  const programs = (org.programs ?? [])
    .filter((g) => !g.for_kids && productions.some((p) => p.program_id === g.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const program = programs.find((g) => g.slug === programParam) ?? null;
  const inProgram = (p: (typeof productions)[number]) => !program || p.program_id === program.id;

  // Upcoming: still to close (or, with no dates, a later year); the rest is past
  const isUpcoming = (p: (typeof productions)[number]) =>
    p.closing_date || p.opening_date ? (p.closing_date ?? p.opening_date)! >= today : p.year > now.getFullYear();
  const tile = (p: (typeof productions)[number]): ProductionTile => ({
    id: p.id,
    slug: p.slug,
    year: p.year,
    title: title(p),
    ground: p.color_ground,
    posterUrl: mediaUrl(p.poster?.thumb_key),
    caption: shortRun(p.opening_date, p.closing_date),
  });
  const upcoming = productions
    .filter((p) => inProgram(p) && isUpcoming(p))
    .sort((a, b) => (a.opening_date ?? `${a.year}-12-31`).localeCompare(b.opening_date ?? `${b.year}-12-31`))
    .map(tile);
  const past = productions.filter((p) => inProgram(p) && !isUpcoming(p)).map(tile);
  const involved = INVOLVED.filter((g) => org[g.key]);

  const website = org.website_url?.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  const socials = SOCIAL.filter((s) => org[s.key]);
  const season = seasonOf(
    productions.flatMap((p) => (p.opening_date ? [p.opening_date] : [])),
    today,
  );
  // Season pass savings: the shows at the usual price, less the pass
  const savings = org.ticket_price != null && org.pass_price != null && org.pass_shows ? Number(org.ticket_price) * org.pass_shows - Number(org.pass_price) : 0;
  const home = org.home;
  const prices = priceLines(org.ticket_prices);
  const seating = home ? [home.seating_capacity && `${home.seating_capacity.toLocaleString("en-US")} seats`, home.seating_style].filter(Boolean).join(" · ") : "";
  type Fact = { label: string; value: React.ReactNode };
  const facts = ([
    home && {
      label: "Home venue",
      value: (
        <span className="flex flex-col">
          <Link href={`/venue/${home.slug}`}>{home.name}</Link>
          {seating && <span className="text-[14px]">{seating}</span>}
          {stageLine(home) && <span className="text-[14px] text-muted">{stageLine(home)}</span>}
          {home.chart && (
            <Link href={`/venue/${home.slug}#seating-chart`} className="text-[14px] font-semibold">
              Seating chart
            </Link>
          )}
        </span>
      ),
    },
        (org.ticket_price != null || org.pass_price != null || prices.length > 0) && {
      label: "Tickets",
      value: (
        <span className="flex flex-col">
          {/* The company's own price list, or else the one typical price */}
          {prices.length > 0 ? (
            <span className="flex flex-col">
              {prices.map((p, i) => (
                <span key={i} className="flex items-baseline justify-between gap-3">
                  <span>{p.label}</span>
                  {p.price && <span className="font-semibold tabular-nums">{p.price}</span>}
                </span>
              ))}
            </span>
          ) : (
            org.ticket_price != null && <span>~{money(Number(org.ticket_price))}</span>
          )}
          {org.pass_price != null && (
            <span className="text-[14px] text-muted">
              Season pass {money(Number(org.pass_price))}
              {org.pass_shows ? ` for ${org.pass_shows} show${org.pass_shows === 1 ? "" : "s"}` : ""}
              {savings > 0 && ` · save ~${money(Math.round(savings))}`}
            </span>
          )}
        </span>
      ),
    },
    season && { label: "Season", value: season },
    org.home?.accessibility && { label: "Access", value: org.home.accessibility },
  ] as (Fact | null | "" | false)[]).filter((f): f is Fact => !!f);

  return (
    <>
      {/* 1. Header */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4 md:gap-6">
            <CompanyLogo thumbKey={org.logo?.thumb_key ?? org.logo?.storage_key} name={org.name} size={88} className="md:hidden" />
            <CompanyLogo thumbKey={org.logo?.thumb_key ?? org.logo?.storage_key} name={org.name} size={128} className="hidden md:flex" />
            <h1 className="display min-w-0 text-[42px] md:text-[72px]">{org.name}</h1>
          </div>
          <EditButton kind="company" slug={slug} signedIn={!!user} />
        </div>
        {(org.town || org.founded_year || org.is_nonprofit) && (
          <p className="m-0 text-[17px] text-muted">
            {[org.town && `${org.town}, ${org.state}`, org.founded_year && `Est. ${org.founded_year}`, org.is_nonprofit && "Nonprofit"].filter(Boolean).join(" · ")}
          </p>
        )}
        {SHOW_COMPANY_LOGOS && (
          <div className="flex flex-col gap-1">
            {user ? (
              <LogoUploader organizationId={org.id} hasLogo={!!org.logo} />
            ) : (
              !org.logo && (
                <Link href={`/signin?next=${encodeURIComponent(path)}`} className="self-start text-[15px] font-semibold">
                  Sign in to add a logo
                </Link>
              )
            )}
            {!!myPendingLogos && <span className="text-sm text-muted">Your logo is waiting for a moderator.</span>}
            {org.logo?.photographer_credit && <span className="text-xs text-muted">Logo: {org.logo.photographer_credit}</span>}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <FollowButton target={{ organizationId: org.id }} following={!!myFollow} count={followers ?? 0} path={path} signedIn={!!user} />
          {org.website_url && (
            <a href={org.website_url} rel="noopener noreferrer" target="_blank" className="btn-secondary" title={website}>
              Website
            </a>
          )}
          {socials.map((s) => (
            <a
              key={s.key}
              href={org[s.key] ?? undefined}
              rel="noopener noreferrer"
              target="_blank"
              aria-label={s.label}
              title={s.label}
              className="link-quiet inline-flex size-11 items-center justify-center rounded-full border-[1.5px] border-rule"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-ink">
                <path d={s.path} />
              </svg>
            </a>
          ))}
        </div>
      </section>

      {/* 2. About */}
      {org.description && (
        <section className="flex flex-col gap-2">
          <h2 className="heading">About</h2>
          <ReadMore text={org.description} />
        </section>
      )}

      {/* 3. Now playing and Auditions open: two cards, side by side on a laptop */}
      {(onStage || auditions.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {onStage && (
            <section className="flex gap-4 rounded-lg border border-rule p-4">
              <div className="w-[96px] shrink-0">
                <PosterTile href={`/production/${onStage.slug}`} title={title(onStage)} ground={onStage.color_ground} posterUrl={mediaUrl(onStage.poster?.thumb_key)} year={onStage.year} company={org.name} />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">{running ? "Now playing" : "Coming up"}</h2>
                <Link href={`/production/${onStage.slug}`} className="text-[20px] font-bold leading-tight">
                  {title(onStage)}
                </Link>
                <span>{shortRun(onStage.opening_date, onStage.closing_date)}</span>
                {onStage.location && (
                  <Link href={`/venue/${onStage.location.slug}`} className="text-[15px] text-muted">
                    {onStage.location.name}
                    {onStage.location.stage_name && ` · ${onStage.location.stage_name}`}
                  </Link>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <WantToSee productionId={onStage.id} path={path} signedIn={!!user} saved={wantToSee.has(onStage.id)} />
                  {(onStage.ticket_url ?? org.tickets_url) && (
                    <a href={onStage.ticket_url ?? org.tickets_url ?? undefined} rel="noopener noreferrer" target="_blank" className="btn-primary">
                      Tickets
                    </a>
                  )}
                </div>
              </div>
            </section>
          )}
          {auditions.length > 0 && (
            <section className="flex flex-col gap-2 rounded-lg border border-rule p-4">
              <h2 className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Auditions open</h2>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {auditions.map(({ p, next: a, more }) => (
                  <li key={p.id} className="flex flex-col">
                    <Link href={`/production/${p.slug}`} className="text-[18px] font-bold leading-tight">
                      {title(p)}
                    </Link>
                    <span className="text-[15px] text-muted">
                      {[a.label, `${localDay(a.starts_at)}, ${localTime(a.starts_at)}`, a.venue?.name ?? a.place, more > 0 && `+${more} more`].filter(Boolean).join(" · ")}
                    </span>
                    <span className="self-start">
                      <RemindMe productionId={p.id} path={path} signedIn={!!user} following={reminded.has(p.id)} />
                    </span>
                  </li>
                ))}
              </ul>
              {org.audition_style && <p className="m-0 border-t border-rule pt-2 text-[14px] text-muted">{org.audition_style}</p>}
            </section>
          )}
        </div>
      )}

      {/* 4. Quick facts */}
      {facts.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col gap-1 rounded-lg bg-soft p-4">
              <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">{f.label}</span>
              <span className="text-[16px]">{f.value}</span>
            </div>
          ))}
        </section>
      )}

      {/* 6. Awards */}
      {awards.length > 0 && (
        <section className="flex max-w-[620px] flex-col gap-3">
          <h2 className="heading">Awards</h2>
          <AwardList rows={awards} withShow limit={5} />
        </section>
      )}

      {/* 7. Productions, with a program filter when the company has programs */}
      {programs.length > 0 && (
        <nav id="productions" aria-label="Programs" className="-mb-6 flex scroll-mt-24 flex-wrap gap-2">
          {[null, ...programs].map((g) => {
            const on = (g?.id ?? null) === (program?.id ?? null);
            return (
              <Link
                key={g?.id ?? "all"}
                href={g ? `${path}?program=${g.slug}#productions` : `${path}#productions`}
                aria-current={on ? "true" : undefined}
                scroll={false}
                className={`link-quiet inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-semibold ${on ? "border-ink bg-ink text-white" : "border-rule"}`}
              >
                {g ? g.name : "All productions"}
              </Link>
            );
          })}
        </nav>
      )}
      {upcoming.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="heading border-b border-rule pb-2">Upcoming</h2>
          <TileGrid productions={upcoming} />
        </section>
      )}
      {past.length > 0 ? (
        <section className="flex flex-col gap-8">
          {upcoming.length > 0 && <h2 className="heading">Past</h2>}
          <ProductionsByYear productions={past} empty="" sub={upcoming.length > 0} />
        </section>
      ) : (
        !upcoming.length && <ProductionsByYear productions={[]} empty="This company’s productions will appear here as they’re added." />
      )}

      {/* 8. Programs and Get involved, side by side */}
      {(programs.length > 0 || involved.length > 0) && (
        <div className="grid gap-8 md:grid-cols-2">
          {programs.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="heading">Programs</h2>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {programs.map((g) => (
                  <li key={g.id}>
                    <Link href={`${path}?program=${g.slug}#productions`} scroll={false}>
                      {g.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {involved.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="heading">Get involved</h2>
              <div className="flex flex-wrap gap-2">
                {involved.map((g) => (
                  <a key={g.key} href={org[g.key] ?? undefined} rel="noopener noreferrer" target="_blank" className="btn-secondary">
                    {g.label}
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* 9. Suggest an edit */}
      <SuggestEdit kind="company" slug={slug} signedIn={!!user} />
      <ModeratorDeleteSection table="organizations" id={org.id} name={org.name} afterDelete="/companies" />
    </>
  );
}
