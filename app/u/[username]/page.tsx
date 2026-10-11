import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { COLLECTIBLES, LEVELS, METALS, levelFor, nextLevel, nextMetal, progressHint } from "@/lib/badges";
import { showColors, swatch } from "@/lib/palette";
import { mediaUrl } from "@/lib/media";
import { currentTime } from "@/lib/calendar";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { CollectibleIcon, Medal } from "@/components/badges/Medal";
import { ShowSeenToggle } from "./ShowSeenToggle";

export const metadata: Metadata = { title: "Contributor profile · Local Theater Database" };

export default function ProfilePage({ params }: PageProps<"/u/[username]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-10 px-4 pb-16 pt-8 md:px-8 md:pt-11">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Profile params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const fmt = (n: number) => n.toLocaleString("en-US");

function ago(iso: string, now: number) {
  const days = Math.floor((now - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/New_York" });
}

type Contribution = { text: React.ReactNode; amount: number; when: string };

async function Profile({ params }: Pick<PageProps<"/u/[username]">, "params">) {
  const { username } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, created_at, show_seen")
    .ilike("username", decodeURIComponent(username))
    .maybeSingle();
  if (!profile) notFound();

  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === profile.id;
  const [{ data: page }, { data: statsRows }, { data: earned }, { data: recent }, { data: seenRows }] = await Promise.all([
    supabase.from("people").select("slug, display_name").eq("verified_owner_id", profile.id).maybeSingle(),
    supabase.rpc("profile_stats", { p_user: profile.id }),
    supabase.from("user_badges").select("badge, earned_at").eq("user_id", profile.id),
    supabase.rpc("recent_contributions", { p_user: profile.id, p_limit: 10 }),
    supabase.rpc("profile_seen", { p_user: profile.id }),
  ]);
  const stats = statsRows?.[0] ?? { points: 0, contributions: 0, photos: 0, seen: null };
  const points = stats.points;
  const level = levelFor(points);
  const next = nextLevel(points);
  const metal = nextMetal(points);
  const earnedKeys = new Set((earned ?? []).map((b) => b.badge));
  const collected = COLLECTIBLES.filter((b) => earnedKeys.has(b.key)).length;
  const first = profile.display_name.split(" ")[0];
  const now = currentTime().getTime();

  // Names for the recent contributions
  const ids = (pick: (r: NonNullable<typeof recent>[number]) => string | null) => [...new Set((recent ?? []).map(pick).filter((x): x is string => !!x))];
  const prodIds = ids((r) =>
    r.production_id ?? (["production_submission", "productions", "auditions"].includes(r.entity_table ?? "") ? r.entity_id : null),
  );
  const personIds = ids((r) => r.person_id ?? (r.entity_table === "people" ? r.entity_id : null));
  const otherIds = ids((r) => (["organizations", "shows", "locations"].includes(r.entity_table ?? "") ? r.entity_id : null));
  const seenIds = (seenRows ?? []).map((s) => s.production_id);
  const [{ data: prods }, { data: people }, { data: orgs }, { data: shows }, { data: venues }, { data: seenProds }] = await Promise.all([
    prodIds.length ? supabase.from("productions").select("id, slug, year, title_override, show:shows(title)").in("id", prodIds) : Promise.resolve({ data: [] }),
    personIds.length ? supabase.from("people").select("id, slug, display_name").in("id", personIds) : Promise.resolve({ data: [] }),
    otherIds.length ? supabase.from("organizations").select("id, slug, name").in("id", otherIds) : Promise.resolve({ data: [] }),
    otherIds.length ? supabase.from("shows").select("id, slug, title").in("id", otherIds) : Promise.resolve({ data: [] }),
    otherIds.length ? supabase.from("locations").select("id, slug, name").in("id", otherIds) : Promise.resolve({ data: [] }),
    seenIds.length
      ? supabase
          .from("productions")
          .select("id, slug, year, title_override, color_ground, color_ground_2, color_ink, color_soft, color_accent, color_edge, show:shows(title), poster:media!productions_poster_fk(thumb_key)")
          .in("id", seenIds)
      : Promise.resolve({ data: [] }),
  ]);
  const link = (href: string, label: string) => (
    <Link href={href} className="font-bold">
      {label}
    </Link>
  );
  const prodLink = (id: string | null) => {
    const p = (prods ?? []).find((x) => x.id === id);
    return p ? link(`/production/${p.slug}`, `${p.title_override ?? p.show?.title} (${p.year})`) : null;
  };
  const pageLink = (table: string | null, id: string | null) => {
    if (table === "people") {
      const p = (people ?? []).find((x) => x.id === id);
      return p ? link(`/person/${p.slug}`, p.display_name) : null;
    }
    if (table === "organizations") {
      const o = (orgs ?? []).find((x) => x.id === id);
      return o ? link(`/company/${o.slug}`, o.name) : null;
    }
    if (table === "shows") {
      const s = (shows ?? []).find((x) => x.id === id);
      return s ? link(`/show/${s.slug}`, s.title) : null;
    }
    if (table === "locations") {
      const v = (venues ?? []).find((x) => x.id === id);
      return v ? link(`/venue/${v.slug}`, v.name) : null;
    }
    return prodLink(id);
  };

  const contributions: Contribution[] = (recent ?? []).map((r) => {
    let text: React.ReactNode = "A contribution";
    if (r.reason === "production_approved") {
      const p = prodLink(r.entity_id) ?? <strong>{r.draft_title || "a production"}</strong>;
      text = (
        <>
          Added {p}
          {r.credits > 0 && ` with ${r.credits} cast and crew`}
        </>
      );
    } else if (r.reason === "poster_approved") {
      text = <>Added the poster for {prodLink(r.production_id) ?? "a production"}</>;
    } else if (r.reason === "photo_approved") {
      text =
        r.media_kind === "headshot" ? (
          <>Added a headshot for {pageLink("people", r.person_id) ?? "a person"}</>
        ) : (
          <>Added a photo of {prodLink(r.production_id) ?? "a production"}</>
        );
    } else if (r.reason === "edit_approved") {
      if (r.entity_table === "auditions") text = <>Added audition dates for {prodLink(r.entity_id) ?? "a production"}</>;
      else if (r.entity_table === "award_entries") text = "Added an award";
      else text = <>Corrected {pageLink(r.entity_table, r.entity_id) ?? "a page"}</>;
    } else if (r.reason === "adjustment") {
      text = "Points adjustment";
    }
    return { text, amount: r.amount, when: ago(r.earned_at, now) };
  });

  const seenList = seenIds.map((id) => (seenProds ?? []).find((p) => p.id === id)).filter((p) => !!p);
  const thisYear = new Date(now).getFullYear();
  const seenThisYear = (seenProds ?? []).filter((p) => p.year === thisYear).length;
  const since = new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" });
  const floor = level?.points ?? 0;
  const pct = next ? Math.max(2, Math.min(100, Math.round(((points - floor) / (next.points - floor)) * 100))) : 100;

  return (
    <>
      {/* Who, and their medal */}
      <section className="flex flex-wrap items-center gap-6">
        <div aria-hidden="true" className="flex h-24 w-24 flex-none items-center justify-center rounded-full bg-[#2B2B2B] text-[38px] font-extrabold text-white">
          {profile.display_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-1.5">
          <h1 className="m-0 text-[36px] font-extrabold leading-none tracking-[-0.03em] md:text-[44px]">{profile.display_name}</h1>
          <span className="text-muted">
            @{profile.username} · Contributor since {since}
            {page && (
              <>
                {" · "}
                <Link href={`/person/${page.slug}`} className="font-semibold text-ink">
                  See {page.display_name} on stage
                </Link>
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-3.5 rounded-[10px] border-[1.5px] border-rule py-3 pl-3 pr-[18px]">
          {level ? (
            <Medal metal={level.metal} dots={level.tier} size={64} />
          ) : (
            <Medal metal="bronze" size={64} muted />
          )}
          <span className="flex flex-col leading-tight">
            <span className="text-[13px] text-muted">Contributor</span>
            <span className="text-2xl font-extrabold">{level?.name ?? "Getting started"}</span>
          </span>
        </div>
      </section>

      {/* Progress to the next level */}
      <section aria-label="Progress to next level" className="flex flex-col gap-2.5 rounded-lg bg-soft px-6 py-5">
        {next ? (
          <>
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1.5">
              <span className="font-bold">
                {fmt(next.points - points)} {next.points - points === 1 ? "point" : "points"} to {next.name}
              </span>
              {metal && metal.key !== next.key && (
                <span className="text-sm text-muted">
                  {fmt(metal.points - points)} points to {metal.name.replace(/ I$/, "")}
                </span>
              )}
            </div>
            <div
              role="progressbar"
              aria-valuemin={floor}
              aria-valuemax={next.points}
              aria-valuenow={points}
              aria-label={`Points toward ${next.name}`}
              className="h-2.5 overflow-hidden rounded-[5px] bg-[#E2E2E0]"
            >
              <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm text-muted">{progressHint(next.points - points)}</span>
          </>
        ) : (
          <span className="font-bold">Diamond: the summit. Thank you for everything you’ve added.</span>
        )}
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-6 border-b border-rule pb-7 md:grid-cols-4">
        {[
          { n: points, label: "Points" },
          { n: stats.contributions, label: "Contributions" },
          ...(stats.seen !== null ? [{ n: stats.seen, label: isOwner && !profile.show_seen ? "Shows seen (only you)" : "Shows seen" }] : []),
          { n: stats.photos, label: "Photos added" },
        ].map((s) => (
          <div key={s.label} className="flex flex-col">
            <span className="text-[30px] font-extrabold tracking-[-0.02em]">{fmt(s.n)}</span>
            <span className="text-sm text-muted">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-12">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
          {/* Badges collected */}
          <section className="flex flex-col gap-3.5">
            <h2 className="heading">
              Badges collected{" "}
              <span className="font-medium text-muted">
                {collected} of {COLLECTIBLES.length}
              </span>
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-x-3 gap-y-[18px]">
              {COLLECTIBLES.map((b) => {
                const has = earnedKeys.has(b.key);
                return (
                  <div key={b.key} className="flex flex-col items-center gap-1.5 text-center">
                    <span className={`flex h-16 w-16 items-center justify-center rounded-xl bg-soft ${has ? "" : "opacity-85"}`}>
                      <CollectibleIcon badge={b} earned={has} />
                    </span>
                    <span className={`text-[13px] font-semibold leading-tight ${has ? "text-ink" : "text-muted"}`}>
                      {b.name}
                      {!has && <span className="sr-only"> (not yet earned)</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Shows seen: shared, or the owner's private view */}
          {stats.seen !== null && (
            <section className="flex flex-col gap-3.5">
              <h2 className="heading">
                Shows seen{" "}
                <span className="font-medium text-muted">
                  {stats.seen}
                  {seenThisYear > 0 && ` · ${seenThisYear} in ${thisYear}`}
                </span>
              </h2>
              {seenList.length ? (
                <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
                  {seenList.map((p) => {
                    const sw = swatch(showColors(p));
                    const title = p.title_override ?? p.show?.title ?? "";
                    const poster = mediaUrl(p.poster?.thumb_key);
                    return (
                      <Link
                        key={p.id}
                        href={`/production/${p.slug}`}
                        aria-label={`${title} (${p.year})`}
                        className="link-quiet flex aspect-[4/5] overflow-hidden rounded-[4px] border"
                        style={{ background: sw.background, borderColor: sw.borderColor }}
                      >
                        {poster ? (
                          <img src={poster} alt={`${title} poster`} className="block h-full w-full object-contain" />
                        ) : (
                          <span className="self-end p-2.5 text-[13px] font-extrabold leading-tight text-muted">{title}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="m-0 text-muted">After a show closes, answer “Did you see it?” on its page and it will appear here.</p>
              )}
              {isOwner ? (
                <ShowSeenToggle initial={profile.show_seen} username={profile.username} />
              ) : (
                <span className="text-[13px] text-muted">
                  {first} chose to share their Seen history. Upcoming plans are never shown.
                </span>
              )}
            </section>
          )}

          {/* Recent contributions */}
          <section className="flex flex-col">
            <h2 className="heading mb-1">Recent contributions</h2>
            {contributions.length ? (
              <ul className="m-0 list-none p-0">
                {contributions.map((c, i) => (
                  <li key={i} className="flex justify-between gap-4 border-b border-rule py-3">
                    <span>{c.text}</span>
                    <span className="whitespace-nowrap text-sm text-muted">
                      {c.amount >= 0 ? `+${c.amount}` : c.amount} · {c.when}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-muted">
                Approved contributions will appear here: productions, posters, photos and corrections.
              </p>
            )}
          </section>
        </div>

        {/* The level ladder */}
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-1.5">
          <h2 className="subheading mb-1">Contributor levels</h2>
          {METALS.map((m) => {
            const here = level?.metal === m.metal;
            const reached = LEVELS.some((l) => l.metal === m.metal && points >= l.points);
            return (
              <div key={m.metal} className={`-mx-2.5 flex items-center gap-3 rounded-md px-2.5 py-2 ${here ? "bg-soft" : ""}`}>
                <Medal metal={m.metal} size={40} muted={!reached} />
                <span className="flex flex-1 flex-col leading-snug">
                  <span className={here ? "font-extrabold" : reached ? "font-semibold" : "font-semibold text-muted"}>
                    {m.name}
                    {here && <span className="text-[13px] font-medium"> · {isOwner ? "you’re here" : `${first}’s here`}</span>}
                  </span>
                  <span className="text-[13px] text-muted">{m.ladder}</span>
                </span>
              </div>
            );
          })}
          <p className="m-0 mt-2 text-[13px] text-muted">
            Points come from approved contributions: 10 per production, 3 per poster, 2 per photo or correction.
          </p>
        </aside>
      </div>
    </>
  );
}
