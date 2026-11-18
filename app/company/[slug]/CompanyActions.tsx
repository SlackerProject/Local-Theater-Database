"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setAuditionFollow, setWatch } from "@/app/follow-actions";

// About: the first sentence, then "Read more" for the rest
export function ReadMore({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const m = text.match(/^[\s\S]+?[.!?](?=\s|$)/);
  const first = m ? m[0] : text;
  const more = text.slice(first.length).trim();
  return (
    <p className="m-0 max-w-[620px] whitespace-pre-line">
      {open || !more ? text : first}
      {more && !open && (
        <>
          {" "}
          <button type="button" onClick={() => setOpen(true)} className="btn-text relative inline min-h-0 after:absolute after:-inset-3 after:content-['']">
            Read more
          </button>
        </>
      )}
    </p>
  );
}

// "Want to see": the same list and calendar as on production pages
export function WantToSee({
  productionId,
  path,
  signedIn,
  saved,
  small = false,
}: {
  productionId: string;
  path: string;
  signedIn: boolean;
  saved: boolean;
  small?: boolean;
}) {
  const size = small ? " min-h-10 px-4 text-sm" : "";
  const [on, setOn] = useState(saved);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!signedIn)
    return (
      <Link href={`/signin?next=${encodeURIComponent(path)}`} className={`btn-secondary${size}`}>
        Want to see
      </Link>
    );
  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        disabled={pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          setError("");
          start(async () => {
            const r = await setWatch(productionId, next ? { status: "want_to_see" } : { status: "none" }, path);
            if (!r.ok) {
              setOn(!next);
              setError(r.error);
            }
          });
        }}
        className={`${on ? "btn-primary" : "btn-secondary"}${size}`}
      >
        {on ? "✓ Want to see" : "Want to see"}
      </button>
      {error && <span className="text-sm font-semibold text-alert">{error}</span>}
    </>
  );
}

// "Remind me" about a production's auditions
export function RemindMe({ productionId, path, signedIn, following }: { productionId: string; path: string; signedIn: boolean; following: boolean }) {
  const [on, setOn] = useState(following);
  const [pending, start] = useTransition();
  if (!signedIn)
    return (
      <Link href={`/signin?next=${encodeURIComponent(path)}`} className="btn-text text-sm">
        Remind me
      </Link>
    );
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={pending}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(async () => {
          const r = await setAuditionFollow(productionId, next, path);
          if (!r.ok) setOn(!next);
        });
      }}
      className="btn-text text-sm"
    >
      {on ? "✓ Reminding you" : "Remind me"}
    </button>
  );
}
