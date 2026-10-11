"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissNotification } from "@/app/follow-actions";

// "New update: {title}" in notifications and on the home page; opening the
// post or pressing Dismiss clears it
export function SiteUpdateNotice({ id, slug, title, summary, unread }: { id: string; slug: string; title: string; summary: string; unread: boolean }) {
  const router = useRouter();
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className={`flex flex-col gap-1.5 ${unread ? "" : "text-muted"}`}>
      <span>
        New update:{" "}
        <Link href={`/updates/${slug}`} className="font-bold">
          {title}
        </Link>
      </span>
      {summary && <span className="text-sm text-muted">{summary}</span>}
      {unread && !gone && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await dismissNotification(id);
              if (r.ok) {
                setGone(true);
                router.refresh();
              }
            })
          }
          className="btn-text self-start text-[15px]"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
