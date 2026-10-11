import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { comingUpFromFollows, homeCounts, playingNow } from "@/lib/home";
import { currentTime, localDay, localTime } from "@/lib/calendar";
import { showColors, swatch } from "@/lib/palette";
import { mediaUrl } from "@/lib/media";
import { ANNOUNCEMENT_KINDS, ANNOUNCEMENT_SELECT, announcement, announcementContext, auditionOffer } from "@/lib/announcements";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { HotlistBox, PlayingNow, TileGrid, UpdatesBox } from "@/components/home/HomeParts";
import { FindYourNameButton, HeroSearch } from "@/components/home/HeroSearch";
import { AnnouncementActions, AnnouncementText } from "@/components/Announcement";
import { SiteUpdateNotice } from "@/components/SiteUpdateNotice";

// The home page: an introduction for visitors (home.html / home-mobile.html),
// a personal page for members (DESIGN.md "Home page (signed in)")
export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <HomeFor />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SiteHeader hideSearch />
      <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-10 md:px-8">
        <p className="m-0 text-muted">Loading…</p>
      </main>
      <SiteFooter />
    </>
  );
}

async function HomeFor() {
  const user = await getCurrentUser();
  return user ? <MemberHome user={user} /> : <VisitorHome />;
}

const fmt = (n: number) => n.toLocaleString("en-US");

// ---------------------------------------------------------------------
// Signed out
// ---------------------------------------------------------------------
const BENEFITS = [
  {
    title: "Never miss a friend’s show",
    text: "Follow the people you love to watch. The moment one of them is cast, you’ll know, right here, without a feed to scroll.",
    icon: (
      <>
        <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
        <path d="M10 20.5a2 2 0 0 0 4 0" />
      </>
    ),
  },
  {
    title: "Know who’s who in every cast",
    text: "Every cast list links to everyone’s past roles, the shows they’ve shared, and the awards they’ve won.",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5" />
        <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.7 2.6 3 5.2" />
      </>
    ),
  },
  {
    title: "Your theater calendar",
    text: "Save the shows you want to see, pick your night, and add it to your phone’s calendar in one tap.",
    icon: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
        <path d="M8.5 15l2.2 2.2L15.5 13" />
      </>
    ),
  },
  {
    title: "Built by the community",
    text: "Anyone can add a show or fix a mistake. Every approved contribution earns points and badges.",
    icon: <path d="M12 3.5l2.5 5.3 5.8.6-4.3 3.9 1.2 5.7-5.2-3-5.2 3 1.2-5.7L3.7 9.4l5.8-.6z" />,
  },
];

async function VisitorHome() {
  const [tiles, { show, counts }] = await Promise.all([playingNow(), homeCounts()]);
  const join = (
    <Link href="/signup" className="btn-primary h-[52px] px-[26px]">
      Create a free account
    </Link>
  );

  return (
    <>
      <SiteHeader hideSearch />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-wrap items-start gap-12 px-4 pb-16 pt-6 md:px-8 md:pt-10">
        <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-9 md:gap-11">
          <section className="flex flex-col gap-5 md:pb-2 md:pt-5">
            <h1 className="m-0 max-w-[760px] text-[40px] font-extrabold leading-none tracking-[-0.035em] md:text-[64px]">Follow local theater.</h1>
            <p className="m-0 max-w-[640px] text-[17px] leading-[1.45] text-[#3F3F3F] md:text-[20px]">
              Every community theater show near you: who’s in it, when it runs, and everything the cast has done before. Follow your
              friends and never miss their next show.
            </p>
            <HeroSearch />
            <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3">
              {join}
              {show && counts && (
                <span className="text-sm text-muted">
                  {fmt(counts.productions)} productions · {fmt(counts.people)} people · {fmt(counts.companies)} companies, and counting
                </span>
              )}
            </div>
          </section>

          <PlayingNow tiles={tiles} />

          {/* On phones the Hotlist comes right after the posters */}
          <div className="md:hidden">
            <HotlistBox />
          </div>

          <section className="flex flex-col gap-5 border-t border-rule pt-7">
            <h2 className="heading">What you get</h2>
            <div className="grid grid-cols-1 gap-x-9 gap-y-7 md:grid-cols-2">
              {BENEFITS.map((b) => (
                <div key={b.title} className="flex flex-col gap-2">
                  <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#141414" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    {b.icon}
                  </svg>
                  <h3 className="m-0 text-lg font-extrabold">{b.title}</h3>
                  <p className="m-0 text-muted">{b.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-wrap items-center gap-x-8 gap-y-5 rounded-[10px] bg-ink px-6 py-7 text-white md:px-9 md:py-8">
            <div className="flex flex-[1_1_360px] flex-col gap-2">
              <h2 className="m-0 text-[24px] font-extrabold leading-[1.15] tracking-[-0.02em] md:text-[28px]">
                In a show? Your stage history may already be here.
              </h2>
              <p className="m-0 text-[#D6D6D6]">
                Find your name and claim your page. Choose your headshot, write your bio, and fill in the shows that are missing.
                It’s free, and it’s yours.
              </p>
            </div>
            <FindYourNameButton />
          </section>

          {/* On phones Updates come after the performer band */}
          <div className="md:hidden">
            <UpdatesBox />
          </div>

          <section className="flex flex-col items-start gap-3 border-t border-rule pt-7">
            <h2 className="m-0 text-[26px] font-extrabold tracking-[-0.02em]">Your local stage, all in one place.</h2>
            <p className="m-0 text-muted">Free, with no ads and no feed.</p>
            {join}
          </section>
        </div>

        <div className="hidden min-w-0 flex-[1_1_300px] flex-col gap-9 md:flex">
          <HotlistBox />
          <UpdatesBox />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

// ---------------------------------------------------------------------
// Signed in
// ---------------------------------------------------------------------
async function MemberHome({ user }: { user: CurrentUser }) {
  const [tiles, following] = await Promise.all([playingNow(), comingUpFromFollows(user.id)]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-wrap items-start gap-12 px-4 pb-16 pt-6 md:px-8 md:pt-10">
        <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-10">
          <h1 className="sr-only">Home</h1>
          <NextShow userId={user.id} />
          <NewForYou userId={user.id} />
          <section className="flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="heading">Coming up from people you follow</h2>
              <Link href="/following" className="inline-flex min-h-11 items-center whitespace-nowrap font-semibold">
                Shows &amp; follows
              </Link>
            </div>
            {following.length ? (
              <TileGrid tiles={following} />
            ) : (
              <p className="m-0 text-muted">
                Follow people and companies from their pages, and their upcoming shows will appear here.
              </p>
            )}
          </section>
          <PlayingNow tiles={tiles} />
        </div>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-9">
          <HotlistBox />
          <UpdatesBox />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

// The next performance they're Going to
async function NextShow({ userId }: { userId: string }) {
  await connection();
  const supabase = await createClient();
  const { data: going } = await supabase
    .from("watch_list")
    .select(
      `performance:performances(id, starts_at, label, is_cancelled),
       production:productions(slug, year, title_override, color_ground, color_ground_2, color_ink, color_soft, color_accent, color_edge,
                              show:shows(title), location:locations(name, town), poster:media!productions_poster_fk(thumb_key))`,
    )
    .eq("user_id", userId)
    .eq("status", "going");
  const now = currentTime().toISOString();
  const next = (going ?? [])
    .filter((g) => g.performance && !g.performance.is_cancelled && g.performance.starts_at >= now && g.production?.show)
    .sort((a, b) => a.performance!.starts_at.localeCompare(b.performance!.starts_at))[0];

  if (!next) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="heading">Your next show</h2>
        <p className="m-0 text-muted">
          Nothing planned yet. Find something below, open it, and choose “I’m going” on a date. It will show up here and on{" "}
          <Link href="/calendar" className="text-ink">
            your calendar
          </Link>
          .
        </p>
      </section>
    );
  }

  const p = next.production!;
  const pf = next.performance!;
  const title = p.title_override ?? p.show!.title;
  const sw = swatch(showColors(p));
  const poster = mediaUrl(p.poster?.thumb_key);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="heading">Your next show</h2>
      <Link
        href={`/production/${p.slug}`}
        className="link-quiet flex max-w-[620px] items-center gap-4 rounded-lg border-2 border-ink p-3"
        style={{ background: sw.background, color: sw.ink }}
      >
        <span className="flex aspect-[4/5] w-[84px] flex-none overflow-hidden rounded-[4px]">
          {poster ? (
            <img src={poster} alt={`${title} poster`} className="h-full w-full object-contain" />
          ) : (
            <span className="flex h-full w-full items-end bg-white p-1.5 text-[11px] font-extrabold leading-tight text-muted">{title}</span>
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xl font-extrabold leading-tight">
            {title} ({p.year})
          </span>
          <span className="font-semibold">
            {localDay(pf.starts_at)} · {localTime(pf.starts_at)}
            {pf.label && ` · ${pf.label}`}
          </span>
          {p.location && <span className="text-[15px]">{[p.location.name, p.location.town].filter(Boolean).join(", ")}</span>}
        </span>
      </Link>
    </section>
  );
}

// The latest unread notifications: follows, auditions and site updates
async function NewForYou({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [{ data: news }, { data: updates }] = await Promise.all([
    supabase
      .from("notifications")
      .select(ANNOUNCEMENT_SELECT)
      .eq("user_id", userId)
      .in("kind", [...ANNOUNCEMENT_KINDS])
      .eq("status", "unread")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("notifications")
      .select("id, status, created_at, post:posts(slug, title, summary)")
      .eq("user_id", userId)
      .eq("kind", "site_update")
      .eq("status", "unread")
      .order("created_at", { ascending: false })
      .limit(2),
  ]);
  const ctx = await announcementContext(supabase, userId, (news ?? []).flatMap((n) => (n.production ? [n.production.id] : [])));
  const items = [
    ...(news ?? []).map((n) => ({ at: n.created_at, kind: "follow" as const, n })),
    ...(updates ?? []).filter((u) => u.post).map((u) => ({ at: u.created_at, kind: "update" as const, u })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="heading">New for you</h2>
        <Link href="/notifications" className="inline-flex min-h-11 items-center whitespace-nowrap font-semibold">
          All notifications
        </Link>
      </div>
      {items.length ? (
        <ul className="m-0 flex list-none flex-col border-t border-rule p-0">
          {items.map((item) => {
            if (item.kind === "update") {
              const u = item.u;
              return (
                <li key={u.id} className="border-b border-rule py-3.5">
                  <SiteUpdateNotice id={u.id} slug={u.post!.slug} title={u.post!.title} summary={u.post!.summary} unread />
                </li>
              );
            }
            const a = announcement(item.n);
            if (!a) return null;
            return (
              <li key={item.n.id} className="flex flex-col gap-2.5 border-b border-rule py-3.5">
                <AnnouncementText a={a} />
                <AnnouncementActions
                  id={item.n.id}
                  kind={a.kind}
                  productionId={a.productionId}
                  productionHref={a.production.href}
                  saved={ctx.saved.has(a.productionId)}
                  auditions={auditionOffer(a.kind, a.productionId, ctx)}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 text-muted">You’re all caught up. News about people and companies you follow will appear here.</p>
      )}
    </section>
  );
}
