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

async function Company({ params }: Pick<PageProps<"/company/[slug]">, "params">) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select(
      `id, name, town, state, website_url, founded_year, description, season_note, access_note, tickets_url,
       facebook_url, instagram_url, youtube_url,
       home:locations!organizations_home_location_id_fkey(slug, name, town),
       logo:media!organizations_logo_fk(thumb_key, storage_key, photographer_credit),
       productions(id, slug, year, title_override, opening_date, closing_date, ticket_url, is_hidden, color_ground,
                   poster:media!productions_poster_fk(thumb_key),
                   show:shows(title), location:locations(slug, name, town),
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
    .filter(isUpcoming)
    .sort((a, b) => (a.opening_date ?? `${a.year}-12-31`).localeCompare(b.opening_date ?? `${b.year}-12-31`))
    .map(tile);
  const past = productions.filter((p) => !isUpcoming(p)).map(tile);

  const website = org.website_url?.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  const socials = SOCIAL.filter((s) => org[s.key]);
  type Fact = { label: string; value: React.ReactNode };
  const facts = ([
    org.home && {
      label: "Home venue",
      value: <Link href={`/venue/${org.home.slug}`}>{org.home.name}</Link>,
    },
    org.season_note && { label: "Season", value: org.season_note },
    org.access_note && { label: "Access", value: org.access_note },
  ] as (Fact | null | "")[]).filter((f): f is Fact => !!f);

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
        {(org.town || org.founded_year) && (
          <p className="m-0 text-[17px] text-muted">
            {[org.town && `${org.town}, ${org.state}`, org.founded_year && `Founded ${org.founded_year}`].filter(Boolean).join(" · ")}
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

      {/* 3. On stage now */}
      {onStage && (
        <section className="flex flex-col gap-4">
          <h2 className="heading">{running ? "On stage now" : "Coming up"}</h2>
          <div className="flex flex-wrap items-start gap-6">
            <div className="w-[160px] shrink-0">
              <PosterTile href={`/production/${onStage.slug}`} title={title(onStage)} ground={onStage.color_ground} posterUrl={mediaUrl(onStage.poster?.thumb_key)} year={onStage.year} company={org.name} />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Link href={`/production/${onStage.slug}`} className="text-[24px] font-bold leading-tight">
                {title(onStage)}
              </Link>
              <span className="text-[17px]">{shortRun(onStage.opening_date, onStage.closing_date)}</span>
              {onStage.location && (
                <Link href={`/venue/${onStage.location.slug}`} className="text-muted">
                  {[onStage.location.name, onStage.location.town].filter(Boolean).join(", ")}
                </Link>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <WantToSee productionId={onStage.id} path={path} signedIn={!!user} saved={wantToSee.has(onStage.id)} />
                {(onStage.ticket_url ?? org.tickets_url) && (
                  <a href={onStage.ticket_url ?? org.tickets_url ?? undefined} rel="noopener noreferrer" target="_blank" className="btn-primary">
                    Tickets
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 4. Auditions */}
      {auditions.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="heading">Auditions</h2>
          <ul className="m-0 list-none border-t border-rule p-0">
            {auditions.map(({ p, next: a, more }) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-rule py-3">
                <span className="flex flex-col">
                  <Link href={`/production/${p.slug}`} className="font-bold">
                    {title(p)}
                  </Link>
                  <span className="text-[15px] text-muted">
                    {[a.label, `${localDay(a.starts_at)}, ${localTime(a.starts_at)}`, a.venue?.name ?? a.place, more > 0 && `+${more} more`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <RemindMe productionId={p.id} path={path} signedIn={!!user} following={reminded.has(p.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 5. Quick facts */}
      {facts.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-3">
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

      {/* 7. Productions */}
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

      {/* 9. Suggest an edit */}
      <SuggestEdit kind="company" slug={slug} signedIn={!!user} />
      <ModeratorDeleteSection table="organizations" id={org.id} name={org.name} afterDelete="/companies" />
    </>
  );
}
