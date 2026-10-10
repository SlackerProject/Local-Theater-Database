import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { signOut } from "@/app/auth-actions";

export const SITE_NAME = "Local Theater Database";

const pill =
  "inline-flex h-11 items-center rounded-full px-[18px] text-[15px] font-medium no-underline";

export function SiteHeader() {
  return (
    <header className="border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-8">
        <Link href="/" className="font-serif text-[26px] text-ink no-underline">
          {SITE_NAME}
        </Link>
        <Suspense fallback={<div className="h-11" />}>
          <UserNav />
        </Suspense>
      </div>
    </header>
  );
}

async function UserNav() {
  const user = await getCurrentUser();
  return (
    <nav
      aria-label="Main"
      className="flex flex-wrap items-center gap-x-[22px] gap-y-1 text-[15px] font-medium"
    >
      {user ? (
        <>
          <Link href="/add" className="text-ink no-underline">
            Add a production
          </Link>
          <Link href="/submissions" className="text-ink no-underline">
            Your submissions
          </Link>
          {hasRole(user, "moderator") && (
            <Link href="/moderate" className="text-ink no-underline">
              Moderate
            </Link>
          )}
          <span className="text-muted">{user.displayName}</span>
          <form action={signOut}>
            <button type="submit" className={`${pill} cursor-pointer border-[1.5px] border-field bg-surface text-ink`}>
              Sign out
            </button>
          </form>
        </>
      ) : (
        <>
          <Link href="/signup" className="text-ink no-underline">
            Join
          </Link>
          <Link href="/signin" className={`${pill} bg-ink text-white`}>
            Sign in
          </Link>
        </>
      )}
    </nav>
  );
}

export function SiteFooter({ children }: { children?: React.ReactNode }) {
  return (
    <footer className="mt-auto border-t border-rule bg-surface">
      <div className="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-x-4 gap-y-2 px-4 py-5 text-sm text-muted sm:px-8">
        <span>Community-built. Anyone can add or correct a page.</span>
        {children}
      </div>
    </footer>
  );
}

// The yellow marquee band under the header: "PERSON", "PRODUCTION"
export function MarqueeBand({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-marquee">
      <div className="eyebrow mx-auto max-w-[1120px] px-4 py-2.5 sm:px-8">{children}</div>
    </div>
  );
}
