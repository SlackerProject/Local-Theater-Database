"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/auth-actions";

type User = { displayName: string; canModerate: boolean; unread: number; pageSlug: string | null } | null;

const BROWSE = [
  { href: "/shows", label: "Shows" },
  { href: "/people", label: "People" },
  { href: "/companies", label: "Companies" },
];

function accountLinks(user: NonNullable<User>) {
  return [
    ...(user.pageSlug ? [{ href: `/person/${user.pageSlug}`, label: "Your page" }] : []),
    { href: "/following", label: "Shows & follows" },
    { href: "/add", label: "Add a production" },
    { href: "/submissions", label: "Your submissions" },
    ...(user.canModerate ? [{ href: "/moderate", label: "Moderate" }] : []),
  ];
}

function initial(name: string) {
  return (name.trim()[0] ?? "?").toUpperCase();
}

const iconLink = "link-quiet relative flex h-11 w-11 items-center justify-center rounded-lg hover:bg-soft";

// The current page gets a 2px ink bar under its icon
function ActiveBar() {
  return <span aria-hidden="true" className="absolute inset-x-2.5 bottom-0.5 h-0.5 bg-ink" />;
}

function CalendarLink({ active }: { active: boolean }) {
  return (
    <Link href="/calendar" aria-label="Your calendar" aria-current={active ? "page" : undefined} className={iconLink}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
      {active && <ActiveBar />}
    </Link>
  );
}

function Bell({ count, active }: { count: number; active: boolean }) {
  return (
    <Link
      href="/notifications"
      aria-label={count ? `Notifications, ${count} new` : "Notifications"}
      aria-current={active ? "page" : undefined}
      className={iconLink}
    >
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
        <path d="M10 20.5a2 2 0 0 0 4 0" />
      </svg>
      {count > 0 && (
        <span aria-hidden="true" className="absolute right-[9px] top-[9px] h-[9px] w-[9px] rounded-full bg-ink shadow-[0_0_0_2px_#fff]" />
      )}
      {active && <ActiveBar />}
    </Link>
  );
}

// Closes a click-opened menu on Escape or a click outside it
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const menuItem = "link-quiet flex min-h-11 items-center px-4 font-semibold";

export function HeaderNav({ user }: { user: User }) {
  const [account, setAccount] = useState(false);
  const [mobile, setMobile] = useState(false);
  const accountRef = useDismiss(account, () => setAccount(false));
  const mobileRef = useDismiss(mobile, () => setMobile(false));
  const path = usePathname();

  return (
    <>
      {/* Desktop: Shows, People, Companies, then Sign in, or the calendar, bell and account menu */}
      <nav aria-label="Main" className="ml-auto hidden items-center gap-6 text-[15px] font-semibold md:flex">
        {BROWSE.map((l) => (
          <Link key={l.href} href={l.href} className="link-quiet whitespace-nowrap">
            {l.label}
          </Link>
        ))}
        {user ? (
          <span className="flex items-center gap-1">
            <CalendarLink active={path === "/calendar"} />
            <Bell count={user.unread} active={path === "/notifications"} />
            <div ref={accountRef} className="relative">
              <button
                type="button"
                aria-label="Your account"
                aria-expanded={account}
                aria-haspopup="menu"
                onClick={() => setAccount((v) => !v)}
                className="flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent"
              >
                <span aria-hidden="true" className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#2B2B2B] text-sm font-bold text-white">
                  {initial(user.displayName)}
                </span>
              </button>
              {account && (
                <div role="menu" className="absolute right-0 top-full z-20 mt-2 flex w-56 flex-col rounded-lg border border-rule bg-page py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                  <span className="px-4 pb-1 pt-1 text-sm font-normal text-muted">Signed in as {user.displayName}</span>
                  {accountLinks(user).map((l) => (
                    <Link key={l.href} href={l.href} role="menuitem" className={menuItem} onClick={() => setAccount(false)}>
                      {l.label}
                    </Link>
                  ))}
                  <form action={signOut} className="border-t border-rule pt-1.5">
                    <button type="submit" role="menuitem" className={`${menuItem} w-full cursor-pointer border-0 bg-transparent text-left text-base`}>
                      Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </span>
        ) : (
          <Link href="/signin" className="btn-primary min-h-11 px-[18px] text-[15px]">
            Sign in
          </Link>
        )}
      </nav>

      {/* Phones: calendar and bell (signed in), then a 44px menu button; links live in the menu */}
      <div ref={mobileRef} className="ml-auto flex items-center md:hidden">
        {user && (
          <>
            <CalendarLink active={path === "/calendar"} />
            <Bell count={user.unread} active={path === "/notifications"} />
          </>
        )}
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={mobile}
          onClick={() => setMobile((v) => !v)}
          className="relative flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent"
        >
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#141414" strokeWidth="2" strokeLinecap="round">
            {mobile ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        {mobile && (
          <nav aria-label="Main" className="absolute inset-x-0 top-full z-20 flex flex-col border-b border-rule bg-page pb-3 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            {BROWSE.map((l) => (
              <Link key={l.href} href={l.href} className={menuItem} onClick={() => setMobile(false)}>
                {l.label}
              </Link>
            ))}
            <div className="mx-4 my-1.5 border-t border-rule" />
            {user ? (
              <>
                <span className="px-4 pb-1 text-sm text-muted">Signed in as {user.displayName}</span>
                <Link href="/calendar" className={menuItem} onClick={() => setMobile(false)}>
                  Your calendar
                </Link>
                <Link href="/notifications" className={menuItem} onClick={() => setMobile(false)}>
                  Notifications
                  {user.unread > 0 && <span className="ml-2 rounded bg-ink px-1.5 text-[13px] font-bold text-white">{user.unread}</span>}
                </Link>
                {accountLinks(user).map((l) => (
                  <Link key={l.href} href={l.href} className={menuItem} onClick={() => setMobile(false)}>
                    {l.label}
                  </Link>
                ))}
                <form action={signOut}>
                  <button type="submit" className={`${menuItem} w-full cursor-pointer border-0 bg-transparent text-left text-base`}>
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/signin" className={menuItem} onClick={() => setMobile(false)}>
                  Sign in
                </Link>
                <Link href="/signup" className={menuItem} onClick={() => setMobile(false)}>
                  Join
                </Link>
              </>
            )}
          </nav>
        )}
      </div>
    </>
  );
}
