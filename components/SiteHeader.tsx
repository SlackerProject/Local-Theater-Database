import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { badgeMessage, LEVELS } from "@/lib/badges";
import { HeaderNav } from "./HeaderNav";
import { BadgeMessage } from "./badges/BadgeMessage";
import { BugReporter } from "./BugReporter";
import { SITE_NAME } from "@/lib/brand";

export { SITE_NAME };

// Search is the primary way in, so it's in the header on every page:
// beside the wordmark on desktop, full width on its own row on phones.
// The home page has its own large search, so it hides this one.
function SearchField({ id, className, defaultValue }: { id: string; className: string; defaultValue?: string }) {
  return (
    <form action="/search" role="search" className={`items-center gap-2.5 rounded-[10px] bg-soft px-4 ${className}`}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5E5E5E" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <label htmlFor={id} className="sr-only">
        Search
      </label>
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search a name, show, or company"
        className="h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none"
      />
    </form>
  );
}

export function SiteHeader({ query, hideSearch = false }: { query?: string; hideSearch?: boolean } = {}) {
  return (
    <header className="relative border-b border-rule bg-page">
      <div className="mx-auto max-w-[1180px] px-4 py-2.5 md:px-8 md:py-3">
        <div className="flex items-center gap-7">
          <Link href="/" className="link-quiet whitespace-nowrap text-xl font-extrabold tracking-[-0.02em] md:text-[22px]">
            {SITE_NAME}
          </Link>
          {!hideSearch && <SearchField id="q" defaultValue={query} className="hidden h-12 max-w-[560px] flex-1 md:flex" />}
          <Suspense fallback={<div className="ml-auto h-11 w-11" />}>
            <UserNav />
          </Suspense>
        </div>
        {!hideSearch && <SearchField id="q-m" defaultValue={query} className="mt-2.5 flex h-[46px] md:hidden" />}
      </div>
    </header>
  );
}

async function UserNav() {
  const user = await getCurrentUser();
  let unread = 0;
  let pageSlug: string | null = null;
  let news: string[] = [];
  let waiting = 0;
  if (user) {
    const supabase = await createClient();
    const [{ count }, { data: page }, { data: badges }, { data: pending }] = await Promise.all([
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "unread"),
      supabase.from("people").select("slug").eq("verified_owner_id", user.id).maybeSingle(),
      supabase.from("user_badges").select("badge, earned_at").eq("user_id", user.id).is("seen_at", null).order("earned_at", { ascending: false }),
      // Decisions waiting in the review queue (moderators only)
      hasRole(user, "moderator") ? supabase.rpc("moderation_pending_count") : Promise.resolve({ data: 0 }),
    ]);
    unread = count ?? 0;
    waiting = Number(pending ?? 0);
    pageSlug = page?.slug ?? null;
    // Newly earned levels and badges, highest level first
    news = (badges ?? [])
      .map((b) => b.badge)
      .sort((a, b) => LEVELS.findIndex((l) => l.key === b) - LEVELS.findIndex((l) => l.key === a))
      .map(badgeMessage)
      .filter((m): m is string => !!m);
  }
  return (
    <>
      <HeaderNav
        user={
          user
            ? {
                displayName: user.displayName,
                username: user.username,
                // Trusted editors see the moderation page too (they can vouch for claims)
                canModerate: hasRole(user, "trusted"),
                canWriteUpdates: hasRole(user, "moderator"),
                unread,
                waiting,
                pageSlug,
              }
            : null
        }
      />
      {user && news.length > 0 && <BadgeMessage messages={news} profileHref={`/u/${user.username}`} />}
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="mx-auto flex max-w-[1180px] flex-wrap justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted md:px-8">
        <span>Community-built. Anyone can add a show or correct a page.</span>
        <span className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/add" className="link-quiet">
            Add a production
          </Link>
          <Link href="/updates" className="link-quiet">
            Updates
          </Link>
          <Link href="/hotlist" className="link-quiet">
            Hotlist
          </Link>
          <Link href="/awards" className="link-quiet">
            Awards
          </Link>
          <BugReporter />
        </span>
      </div>
    </footer>
  );
}
