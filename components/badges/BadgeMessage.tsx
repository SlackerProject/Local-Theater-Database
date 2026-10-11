"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { dismissBadgeMessage } from "@/app/u/actions";

// "You reached Silver III": shown once when a level or badge is earned,
// gone for good once dismissed (or once the profile link is followed)
export function BadgeMessage({ messages, profileHref }: { messages: string[]; profileHref: string }) {
  const [open, setOpen] = useState(true);
  const [, start] = useTransition();
  if (!open) return null;

  const dismiss = () => {
    setOpen(false);
    start(() => dismissBadgeMessage());
  };

  return (
    <div role="status" className="absolute inset-x-0 top-full z-10 border-b border-rule bg-soft">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 md:px-8">
        <strong>{messages[0]}!</strong>
        {messages.length > 1 && (
          <span className="text-[15px] text-muted">
            And {messages.length - 1} more new {messages.length === 2 ? "badge" : "badges"}.
          </span>
        )}
        <Link href={profileHref} onClick={dismiss} className="text-[15px] font-semibold">
          See your profile
        </Link>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="ml-auto inline-flex h-9 w-9 cursor-pointer items-center justify-center border-0 bg-transparent">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
