"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissNotification, wantToSeeFromNotification } from "@/app/follow-actions";
import type { announcement } from "@/lib/announcements";

type A = NonNullable<ReturnType<typeof announcement>>;

// "{Name} was just cast as {Role} in {Show} ({Year}) at {Company}"
export function AnnouncementText({ a }: { a: A }) {
  const show = (
    <Link href={a.production.href} className="font-bold">
      {a.production.label}
    </Link>
  );
  const company = a.company && (
    <Link href={a.company.href} className="font-bold">
      {a.company.label}
    </Link>
  );
  if (a.kind === "company_announcement" || !a.person) {
    return (
      <span>
        {company ?? "A company you follow"} announced {show}
      </span>
    );
  }
  return (
    <span>
      <Link href={a.person.href} className="font-bold">
        {a.person.label}
      </Link>{" "}
      {a.verb}
      {a.role && <> as {a.role}</>} in {show}
      {company && <> at {company}</>}
    </span>
  );
}

// Want to see (saves the run) and Dismiss, right in the notification
export function AnnouncementActions({ id, productionId, saved }: { id: string; productionId: string; saved: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<"saved" | "dismissed" | null>(null);
  const [error, setError] = useState("");

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, result: "saved" | "dismissed") =>
    start(async () => {
      setError("");
      const r = await action();
      if (r.ok) {
        setDone(result);
        router.refresh();
      } else setError(r.error ?? "That didn’t work.");
    });

  if (done === "saved") return <span className="text-sm font-semibold">Saved to your calendar.</span>;
  if (done === "dismissed") return <span className="text-sm text-muted">Dismissed.</span>;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {saved ? (
        <span className="text-sm font-semibold">Already on your calendar.</span>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => wantToSeeFromNotification(id, productionId), "saved")}
          className="btn-primary min-h-11 px-4 text-[15px]"
        >
          Want to see
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => run(() => dismissNotification(id), "dismissed")} className="btn-text text-[15px]">
        Dismiss
      </button>
      {error && (
        <span role="alert" className="w-full text-sm font-semibold">
          {error}
        </span>
      )}
    </div>
  );
}
