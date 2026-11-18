import type { Metadata } from "next";
import Link from "next/link";
import { forwardIfMerged } from "@/lib/merged";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { type ProductionTile } from "@/components/ProductionsByYear";
import { SeeAll } from "@/components/SeeAll";
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
import { RemindMe, WantToSee } from "./CompanyActions";

// Browser tab and shared links: "Company · Town · Local Theater Database"
export async function generateMetadata({
  params,
}: PageProps<"/company/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("name, town, description")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) return { title: "Company" };
  const title = [org.name, org.town].filter(Boolean).join(" · ");
  const description =
    org.description ||
    `Productions by ${org.name}${org.town ? ` in ${org.town}` : ""}.`;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `/company/${slug}`,
      title,
      description,
    },
    twitter: { card: "summary", title, description },
  };
}

export default function CompanyPage({ params }: PageProps<"/company/[slug]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-12 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Company params={params} />
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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
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

// The season as the company describes it: "Sep–May · 4 shows a year",
// then "2 musicals · 1 play · 1 other". Only what's been entered shows.
type SeasonFacts = {
  season_start_month: number | null;
  season_end_month: number | null;
  musicals_per_season: number | null;
  plays_per_season: number | null;
  other_per_season: number | null;
};
function seasonOf(o: SeasonFacts) {
  const start = o.season_start_month ? MONTHS[o.season_start_month - 1] : null;
  const end = o.season_end_month ? MONTHS[o.season_end_month - 1] : null;
  const span =
    start && end
      ? start === end
        ? start
        : `${start}–${end}`
      : start
        ? `From ${start}`
        : end
          ? `Through ${end}`
          : null;
  const counts = [
    o.musicals_per_season,
    o.plays_per_season,
    o.other_per_season,
  ];
  const total = counts.some((n) => n != null)
    ? counts.reduce<number>((a, n) => a + (n ?? 0), 0)
    : null;
  const main = [
    span,
    total ? `${total} show${total === 1 ? "" : "s"} a year` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const mix = [
    o.musicals_per_season
      ? `${o.musicals_per_season} musical${o.musicals_per_season === 1 ? "" : "s"}`
      : null,
    o.plays_per_season
      ? `${o.plays_per_season} play${o.plays_per_season === 1 ? "" : "s"}`
      : null,
    o.other_per_season ? `${o.other_per_season} other` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return main || mix ? { main, mix } : null;
}

async function Company({
  params,
}: Pick<PageProps<"/company/[slug]">, "params">) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select(
      `id, name, town, state, website_url, founded_year, description, is_nonprofit, ticket_price, ticket_prices, pass_price, pass_shows,
       audition_info_url, tickets_url, short_name, season_start_month, season_end_month,
       musicals_per_season, plays_per_season, other_per_season,
       facebook_url, instagram_url, youtube_url, membership_url, volunteer_url, house_staff_url, newsletter_url, donate_url,
       home:locations!organizations_home_location_id_fkey(slug, name, town, state, postal_code, stage_name, street_address, seating_capacity,
                                                          seating_style, accessibility, chart:media!locations_seating_chart_fk(thumb_key, storage_key)),
       logo:media!organizations_logo_fk(thumb_key, storage_key, photographer_credit),
       productions(id, slug, year, title_override, opening_date, closing_date, ticket_url, is_hidden, color_ground,
                   poster:media!productions_poster_fk(thumb_key),
                   show:shows(title), location:locations(slug, name, town, stage_name, street_address),
                   auditions(id, starts_at, label, place, venue:locations(name)))`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!org) return forwardIfMerged("organizations", slug);

  const user = await getCurrentUser();
  const productions = (org.productions ?? []).filter(
    (p) => p.show && !p.is_hidden,
  );
  const ids = productions.map((p) => p.id);
  const path = `/company/${slug}`;

  const [
    { data: followers },
    { data: myFollow },
    { count: myPendingLogos },
    { data: showAwards },
    { data: ownAwards },
    { data: watching },
    { data: reminders },
  ] = await Promise.all([
    supabase.rpc("follower_count", { p_organization_id: org.id }),
    user
      ? supabase
          .from("follows")
          .select("id")
          .eq("user_id", user.id)
          .eq("organization_id", org.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase
          .from("media")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org.id)
          .eq("uploaded_by", user.id)
          .eq("status", "pending")
      : Promise.resolve({ count: 0 }),
    ids.length
      ? supabase
          .from("award_entries")
          .select(AWARD_SELECT)
          .in("production_id", ids)
      : Promise.resolve({ data: [] }),
    supabase
      .from("award_entries")
      .select(AWARD_SELECT)
      .eq("organization_id", org.id),
    user && ids.length
      ? supabase
          .from("watch_list")
          .select("production_id, status")
          .eq("user_id", user.id)
          .in("production_id", ids)
      : Promise.resolve({ data: [] }),
    user && ids.length
      ? supabase
          .from("audition_follows")
          .select("production_id")
          .eq("user_id", user.id)
          .in("production_id", ids)
      : Promise.resolve({ data: [] }),
  ]);

  // Awards: everything its productions earned, plus its own honors
  const seen = new Set<string>();
  const awards = sortAwards(
    (
      [...(showAwards ?? []), ...(ownAwards ?? [])] as unknown as AwardRow[]
    ).filter((a) => !seen.has(a.id) && !!seen.add(a.id)),
  );

  const now = currentTime();
  const today = localDate(now);
  const title = (p: (typeof productions)[number]) =>
    p.title_override ?? p.show!.title;

  const wantToSee = new Set(
    (watching ?? [])
      .filter((w) => w.status === "want_to_see")
      .map((w) => w.production_id),
  );
  const reminded = new Set((reminders ?? []).map((r) => r.production_id));

  // Auditions coming up, each production at its next session
  const auditions = productions
    .flatMap((p) => {
      const upcoming = (p.auditions ?? [])
        .filter((a) => a.starts_at >= now.toISOString())
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      return upcoming.length
        ? [{ p, next: upcoming[0], more: upcoming.length - 1 }]
        : [];
    })
    .sort((a, b) => a.next.starts_at.localeCompare(b.next.starts_at));

  // Upcoming: still to close (or, with no dates, a later year); the rest is past
  const isUpcoming = (p: (typeof productions)[number]) =>
    p.closing_date || p.opening_date
      ? (p.closing_date ?? p.opening_date)! >= today
      : p.year > now.getFullYear();
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
    .filter(isUpcoming)
    .sort((a, b) =>
      (a.opening_date ?? `${a.year}-12-31`).localeCompare(
        b.opening_date ?? `${b.year}-12-31`,
      ),
    );
  const past = productions
    .filter((p) => !isUpcoming(p))
    .sort((a, b) =>
      (b.opening_date ?? `${b.year}-00`).localeCompare(
        a.opening_date ?? `${a.year}-00`,
      ),
    )
    .map(tile);
  const involved = INVOLVED.filter((g) => org[g.key]);

  const website = org.website_url
    ?.replace(/^https?:\/\/(www\.)?/i, "")
    .replace(/\/$/, "");
  const socials = SOCIAL.filter((s) => org[s.key]);
  const season = seasonOf(org);
  // Season pass savings: the shows at the usual price, less the pass
  const savings =
    org.ticket_price != null && org.pass_price != null && org.pass_shows
      ? Number(org.ticket_price) * org.pass_shows - Number(org.pass_price)
      : 0;
  const venue = org.home;
  const prices = priceLines(org.ticket_prices);
  const hasTickets =
    org.ticket_price != null ||
    org.pass_price != null ||
    prices.length > 0 ||
    !!org.tickets_url;
  const venueAddress = venue
    ? [venue.street_address, venue.town].filter(Boolean).join(", ")
    : "";
  const mapUrl = venue
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        venue.street_address
          ? [venue.street_address, venue.town, venue.state, venue.postal_code]
              .filter(Boolean)
              .join(", ")
          : `${venue.name}, ${venue.town ?? ""}`,
      )}`
    : "";
  const box = "flex flex-col gap-1.5 rounded-lg bg-soft p-4";
  const boxLabel =
    "m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-muted";
  const PAST_SHOWN = 10;

  // The side column: venue, tickets, season, auditions, get involved
  const aside = (
    <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
      {venue && (
        <section className={box}>
          <h2 className={boxLabel}>Primary venue</h2>
          <Link
            href={`/venue/${venue.slug}`}
            className="text-[18px] font-bold leading-tight"
          >
            {venue.name}
          </Link>
          {venue.stage_name && (
            <span className="text-[15px]">{venue.stage_name}</span>
          )}
          {venueAddress && (
            <a
              href={mapUrl}
              rel="noopener noreferrer"
              target="_blank"
              className="text-[14px] text-muted"
            >
              {venueAddress}
            </a>
          )}
          {(venue.seating_capacity || venue.seating_style) && (
            <span className="text-[15px]">
              {[
                venue.seating_capacity &&
                  `${venue.seating_capacity.toLocaleString("en-US")} seats`,
                venue.seating_style,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {venue.accessibility && (
            <span className="text-[14px] text-muted">
              {venue.accessibility}
            </span>
          )}
          {venue.chart && (
            <Link
              href={`/venue/${venue.slug}#seating-chart`}
              className="mt-1 block overflow-hidden rounded border border-rule bg-white"
              title="Seating chart"
            >
              <img
                src={mediaUrl(
                  venue.chart.thumb_key ?? venue.chart.storage_key,
                )!}
                alt={`Seating chart for ${venue.name}`}
                className="h-auto max-h-[180px] w-full object-contain"
              />
            </Link>
          )}
        </section>
      )}

      {(hasTickets || season) && (
        <div
          className={`grid gap-4 lg:grid-cols-1 ${hasTickets && season ? "grid-cols-2" : ""}`}
        >
          {hasTickets && (
            <section className={box}>
              <h2 className={boxLabel}>Tickets</h2>
              {/* The company's own price list, or else the one typical price */}
              {prices.length > 0 ? (
                <span className="flex flex-col text-[15px]">
                  {prices.map((p, i) => (
                    <span
                      key={i}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span>{p.label}</span>
                      {p.price && (
                        <span className="font-semibold tabular-nums">
                          {p.price}
                        </span>
                      )}
                    </span>
                  ))}
                </span>
              ) : (
                org.ticket_price != null && (
                  <span>~{money(Number(org.ticket_price))}</span>
                )
              )}
              {org.pass_price != null && (
                <span className="text-[14px] text-muted">
                  Season pass {money(Number(org.pass_price))}
                  {org.pass_shows
                    ? ` for ${org.pass_shows} show${org.pass_shows === 1 ? "" : "s"}`
                    : ""}
                  {savings > 0 && ` · save ~${money(Math.round(savings))}`}
                </span>
              )}
              {org.tickets_url && (
                <a
                  href={org.tickets_url}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="text-[14px] font-semibold"
                >
                  Buy tickets ↗
                </a>
              )}
            </section>
          )}
          {season && (
            <section className={box}>
              <h2 className={boxLabel}>Season</h2>
              {season.main && <span>{season.main}</span>}
              {season.mix && (
                <span className="text-[14px] text-muted">{season.mix}</span>
              )}
            </section>
          )}
        </div>
      )}

      {(auditions.length > 0 || org.audition_info_url) && (
        <section className="flex flex-col gap-2 rounded-lg border border-rule p-4">
          <h2 className={boxLabel}>
            {auditions.length > 0 ? "Auditions open" : "Auditions"}
          </h2>
          {auditions.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {auditions.map(({ p, next: a, more }) => (
                <li key={p.id} className="flex flex-col">
                  <Link
                    href={`/production/${p.slug}`}
                    className="font-bold leading-tight"
                  >
                    {title(p)}
                  </Link>
                  <span className="text-[14px] text-muted">
                    {[
                      a.label,
                      `${localDay(a.starts_at)}, ${localTime(a.starts_at)}`,
                      a.venue?.name ?? a.place,
                      more > 0 && `+${more} more`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="self-start">
                    <RemindMe
                      productionId={p.id}
                      path={path}
                      signedIn={!!user}
                      following={reminded.has(p.id)}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {org.audition_info_url && (
            <a
              href={org.audition_info_url}
              rel="noopener noreferrer"
              target="_blank"
              className={`text-[14px] font-semibold ${auditions.length > 0 ? "border-t border-rule pt-2" : ""}`}
            >
              General audition details ↗
            </a>
          )}
        </section>
      )}

      {involved.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={boxLabel}>Get involved</h2>
          <div className="flex flex-wrap gap-2">
            {involved.map((g) => (
              <a
                key={g.key}
                href={org[g.key] ?? undefined}
                rel="noopener noreferrer"
                target="_blank"
                className="btn-secondary min-h-10 px-4 text-sm"
              >
                {g.label}
              </a>
            ))}
          </div>
        </section>
      )}
    </aside>
  );

  return (
    <>
      {/* The name and location, across the top */}
      <section className="-mb-6 flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4 md:gap-5">
            <CompanyLogo
              thumbKey={org.logo?.thumb_key ?? org.logo?.storage_key}
              name={org.name}
              size={72}
              className="md:hidden"
            />
            <CompanyLogo
              thumbKey={org.logo?.thumb_key ?? org.logo?.storage_key}
              name={org.name}
              size={104}
              className="hidden md:flex"
            />
            <h1 className="display min-w-0 text-[38px] md:text-[56px]">
              {org.name}
            </h1>
          </div>
          <EditButton kind="company" slug={slug} signedIn={!!user} />
        </div>
        {(org.town ||
          org.founded_year ||
          org.is_nonprofit ||
          org.short_name) && (
          <p className="m-0 text-[17px] text-muted">
            {[
              org.short_name && `Known as ${org.short_name}`,
              org.town && `${org.town}, ${org.state}`,
              org.founded_year && `Est. ${org.founded_year}`,
              org.is_nonprofit && "Nonprofit",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </section>

      {/* Two columns on a laptop, the side column starting just under the
          name; on a phone: upcoming, the side column, then awards and past */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr]">
        <div className="flex min-w-0 flex-col gap-10 lg:col-start-1">
          {/* Website, Follow and the About line */}
          <section className="flex flex-col gap-3">
            {(org.website_url || socials.length > 0) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {org.website_url && (
                  <a
                    href={org.website_url}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="inline-flex min-h-10 items-center gap-1.5 font-semibold"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden
                      className="size-[18px] fill-none stroke-current"
                      strokeWidth="1.8"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
                    </svg>
                    {website}
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
                    className="link-quiet inline-flex size-10 items-center justify-center"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden
                      className="size-5 fill-ink"
                    >
                      <path d={s.path} />
                    </svg>
                  </a>
                ))}
              </div>
            )}
            {SHOW_COMPANY_LOGOS && (
              <div className="flex flex-col gap-1">
                {user ? (
                  <LogoUploader organizationId={org.id} hasLogo={!!org.logo} />
                ) : (
                  !org.logo && (
                    <Link
                      href={`/signin?next=${encodeURIComponent(path)}`}
                      className="self-start text-[15px] font-semibold"
                    >
                      Sign in to add a logo
                    </Link>
                  )
                )}
                {!!myPendingLogos && (
                  <span className="text-sm text-muted">
                    Your logo is waiting for a moderator.
                  </span>
                )}
                {org.logo?.photographer_credit && (
                  <span className="text-xs text-muted">
                    Logo: {org.logo.photographer_credit}
                  </span>
                )}
              </div>
            )}
            <div>
              <FollowButton
                target={{ organizationId: org.id }}
                following={!!myFollow}
                count={followers ?? 0}
                path={path}
                signedIn={!!user}
              />
            </div>
            {org.description && (
              <p className="m-0 max-w-[620px] whitespace-pre-line">
                {org.description}
              </p>
            )}
          </section>

          {/* Upcoming, each with Want to see and Tickets */}
          {upcoming.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="heading border-b border-rule pb-2">Upcoming</h2>
              <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
                {upcoming.map((p) => {
                  const nowOn = !!p.opening_date && p.opening_date <= today;
                  const tickets = p.ticket_url ?? org.tickets_url;
                  return (
                    <li
                      key={p.id}
                      className="flex gap-3 rounded-lg border border-rule p-3"
                    >
                      <div className="w-[76px] shrink-0">
                        <PosterTile
                          href={`/production/${p.slug}`}
                          title={title(p)}
                          ground={p.color_ground}
                          posterUrl={mediaUrl(p.poster?.thumb_key)}
                          year={p.year}
                          company={org.name}
                        />
                      </div>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        {nowOn && (
                          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                            Now playing
                          </span>
                        )}
                        <Link
                          href={`/production/${p.slug}`}
                          className="font-bold leading-tight"
                        >
                          {title(p)}
                        </Link>
                        <span className="text-[14px]">
                          {shortRun(p.opening_date, p.closing_date) || p.year}
                        </span>
                        {p.location && p.location.slug !== venue?.slug && (
                          <span className="text-[14px] text-muted">
                            {p.location.name}
                          </span>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <WantToSee
                            productionId={p.id}
                            path={path}
                            signedIn={!!user}
                            saved={wantToSee.has(p.id)}
                            small
                          />
                          {tickets && (
                            <a
                              href={tickets}
                              rel="noopener noreferrer"
                              target="_blank"
                              className="btn-primary min-h-10 px-4 text-sm"
                            >
                              Tickets
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        {aside}

        <div className="flex min-w-0 flex-col gap-10 lg:col-start-1">
          {awards.length > 0 && (
            <section className="flex max-w-[620px] flex-col gap-3">
              <h2 className="heading">Awards</h2>
              <AwardList rows={awards} withShow collapsible />
            </section>
          )}

          {/* Past productions: one compact grid, newest first */}
          {past.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="heading border-b border-rule pb-2">
                {upcoming.length ? "Past" : "Productions"}
              </h2>
              {(() => {
                const grid = (
                  <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 xl:grid-cols-5">
                    {past.map((p, i) => (
                      <div
                        key={p.id}
                        className={
                          i >= PAST_SHOWN && past.length > PAST_SHOWN + 2
                            ? "group-data-[collapsed=true]:hidden"
                            : ""
                        }
                      >
                        <PosterTile
                          href={`/production/${p.slug}`}
                          title={p.title}
                          ground={p.ground}
                          posterUrl={p.posterUrl}
                          year={p.year}
                          company={org.name}
                          caption={
                            <>
                              <span className="text-[14px] font-bold leading-tight">
                                {p.title}
                              </span>
                              <span className="text-[12px] text-muted">
                                {p.caption ? `${p.caption}, ${p.year}` : p.year}
                              </span>
                            </>
                          }
                        />
                      </div>
                    ))}
                  </div>
                );
                return past.length > PAST_SHOWN + 2 ? (
                  <SeeAll total={past.length}>{grid}</SeeAll>
                ) : (
                  grid
                );
              })()}
            </section>
          ) : (
            !upcoming.length && (
              <p className="m-0 text-muted">
                This company’s productions will appear here as they’re added.
              </p>
            )
          )}
        </div>
      </div>

      <SuggestEdit kind="company" slug={slug} signedIn={!!user} />
      <ModeratorDeleteSection
        table="organizations"
        id={org.id}
        name={org.name}
        afterDelete="/companies"
      />
    </>
  );
}
