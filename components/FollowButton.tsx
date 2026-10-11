"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setFollow } from "@/app/follow-actions";

// Follow (ink) / Following (outline) with the follower count beside it.
// Signed-out visitors are sent to sign in first, then back here.
export function FollowButton({
  target,
  following,
  count,
  path,
  signedIn,
}: {
  target: { personId: string } | { organizationId: string };
  following: boolean;
  count: number;
  path: string;
  signedIn: boolean;
}) {
  const [on, setOn] = useState(following);
  const [n, setN] = useState(count);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const label = `${n} ${n === 1 ? "follower" : "followers"}`;

  if (!signedIn) {
    return (
      <div className="flex flex-wrap items-center gap-3.5">
        <Link href={`/signin?next=${encodeURIComponent(path)}`} className="btn-primary h-[46px] px-[22px]">
          Follow
        </Link>
        <span className="text-sm text-muted">{label}</span>
      </div>
    );
  }

  function toggle() {
    const next = !on;
    setError("");
    setOn(next);
    setN((v) => v + (next ? 1 : -1));
    start(async () => {
      const r = await setFollow(target, next, path);
      if (!r.ok) {
        setOn(!next);
        setN((v) => v + (next ? -1 : 1));
        setError(r.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={on}
        className={`${on ? "btn-secondary" : "btn-primary"} h-[46px] gap-2 px-[22px]`}
      >
        {on && (
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
        {on ? "Following" : "Follow"}
      </button>
      <span className="text-sm text-muted">{label}</span>
      {error && (
        <span role="alert" className="w-full text-sm font-semibold">
          {error}
        </span>
      )}
    </div>
  );
}
