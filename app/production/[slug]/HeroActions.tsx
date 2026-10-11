"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { setWatch, type WatchChoice } from "@/app/follow-actions";

export type PerformanceRow = {
  id: string;
  when: string; //    "Sat, Oct 17, 2026, 7:30 PM"
  day: string; //     "Sat, Oct 17"
  time: string; //    "7:30 PM"
  label: string | null;
  cancelled: boolean;
  past: boolean;
  google: string; //  Add to Google Calendar link
  ics: string; //     .ics download
};

type Status = "want_to_see" | "going" | "seen" | null;

function Check() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

// The hero's actions: Want to see, All performances (with I'm going on each
// date), the night you're going with calendar links, and, once the run has
// closed, "Did you see it?". Hero buttons use the show's ink on its ground.
export function HeroActions({
  productionId,
  path,
  signedIn,
  status: initialStatus,
  goingId: initialGoingId,
  performances,
  closed,
  ink,
  ground,
}: {
  productionId: string;
  path: string;
  signedIn: boolean;
  status: Status;
  goingId: string | null;
  performances: PerformanceRow[];
  closed: boolean;
  ink: string;
  ground: string;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [goingId, setGoingId] = useState(initialGoingId);
  const [open, setOpen] = useState(false);
  const [askSeen, setAskSeen] = useState(true);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const listId = useId();
  const signInHref = `/signin?next=${encodeURIComponent(path)}`;

  // Solid hero button: the show's ink with its ground (or white) as text
  const solid = { background: ink, color: ink.toUpperCase() === "#FFFFFF" ? ground : "#FFFFFF" };
  const outline = { color: ink };
  const rule = `1px solid color-mix(in srgb, ${ink} 18%, ${ground})`;
  const going = performances.find((p) => p.id === goingId) ?? null;
  const upcoming = performances.some((p) => !p.past && !p.cancelled);

  function choose(choice: WatchChoice) {
    const before = { status, goingId };
    setError("");
    setStatus(choice.status === "none" ? null : choice.status);
    setGoingId(choice.status === "going" ? choice.performanceId : choice.status === "seen" ? goingId : null);
    start(async () => {
      const r = await setWatch(productionId, choice, path);
      if (!r.ok) {
        setStatus(before.status);
        setGoingId(before.goingId);
        setError(r.error);
      }
    });
  }

  const calendarLinks = (p: PerformanceRow) => (
    <span className="flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
      <a href={p.google} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: ink }}>
        Add to Google Calendar
      </a>
      <a href={p.ics} download className="font-semibold underline" style={{ color: ink }}>
        Download for Apple or Outlook (.ics)
      </a>
    </span>
  );

  return (
    <div className="mt-1.5 flex flex-col gap-3" style={{ color: ink }}>
      {/* After the run: did you see it? */}
      {closed && signedIn && status === "seen" && (
        <p className="m-0 flex flex-wrap items-center gap-x-3 font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <Check /> You saw this
          </span>
          <button type="button" disabled={pending} onClick={() => choose({ status: "none" })} className="btn-text min-h-11" style={{ color: ink }}>
            Undo
          </button>
        </p>
      )}
      {closed && signedIn && status !== "seen" && !askSeen && (
        <p className="m-0 flex flex-wrap items-center gap-x-3 text-[15px]">
          <span>You said you didn’t see it.</span>
          <button type="button" onClick={() => setAskSeen(true)} className="btn-text min-h-11 text-[15px]" style={{ color: ink }}>
            Change your answer
          </button>
        </p>
      )}
      {closed && signedIn && status !== "seen" && askSeen && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-bold">Did you see it?</span>
          <button type="button" disabled={pending} onClick={() => choose({ status: "seen" })} className="btn-primary min-h-11 px-5" style={solid}>
            Yes
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setAskSeen(false);
              if (status) choose({ status: "none" });
            }}
            className="btn-secondary min-h-11 px-5"
            style={outline}
          >
            No
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2.5">
        {/* Want to see (before and during the run) */}
        {!closed &&
          (!signedIn ? (
            <Link href={signInHref} className="btn-primary" style={solid}>
              Want to see
            </Link>
          ) : status === "going" && going ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setOpen((v) => !v)}
              className="btn-primary gap-2"
              style={{ background: ground, color: ink, border: `2px solid ${ink}` }}
            >
              <Check /> Going · {going.day}
            </button>
          ) : status === "seen" ? (
            <button type="button" disabled={pending} aria-pressed onClick={() => choose({ status: "none" })} className="btn-secondary gap-2" style={outline}>
              <Check /> Seen
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              aria-pressed={status === "want_to_see"}
              onClick={() => choose({ status: status === "want_to_see" ? "none" : "want_to_see" })}
              className={`${status === "want_to_see" ? "btn-secondary" : "btn-primary"} gap-2`}
              style={status === "want_to_see" ? outline : solid}
            >
              {status === "want_to_see" && <Check />}
              {status === "want_to_see" ? "Saved: want to see" : "Want to see"}
            </button>
          ))}

        {performances.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
            className="btn-secondary gap-2"
            style={outline}
          >
            All performances
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={open ? "rotate-180" : ""}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* The night you're going, with ways to get it onto your phone */}
      {status === "going" && going && !going.past && (
        <div className="flex max-w-[620px] flex-col gap-1">
          <span>
            You’re going <strong>{going.day}</strong> at {going.time}.
          </span>
          {calendarLinks(going)}
        </div>
      )}
      {status === "want_to_see" && upcoming && !open && (
        <p className="m-0 text-[15px]">Saved. Open All performances and choose “I’m going” on a date.</p>
      )}

      {error && (
        <p role="alert" className="m-0 font-semibold">
          {error}
        </p>
      )}

      {open && (
        <ul id={listId} className="m-0 flex max-w-[620px] list-none flex-col p-0">
          {performances.map((p) => {
            const isGoing = status === "going" && p.id === goingId;
            const canGo = !p.past && !p.cancelled;
            return (
              <li key={p.id} className="flex flex-col gap-1.5 py-2" style={{ borderBottom: rule }}>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className={p.cancelled ? "line-through opacity-70" : p.past ? "opacity-70" : ""}>
                    {p.when}
                    {p.label && <span className="font-semibold"> · {p.label}</span>}
                    {p.cancelled && " (cancelled)"}
                  </span>
                  {canGo &&
                    (!signedIn ? (
                      <Link href={signInHref} className="btn-secondary min-h-11 px-4 text-[15px]" style={outline}>
                        I’m going
                      </Link>
                    ) : isGoing ? (
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-flex min-h-[30px] items-center gap-1.5 rounded-md px-2.5 text-[15px] font-bold"
                          style={{ background: ground, border: `2px solid ${ink}` }}
                        >
                          <Check /> Going
                        </span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => choose({ status: "want_to_see" })}
                          className="btn-text min-h-11 px-1 text-[15px]"
                          style={{ color: ink }}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => choose({ status: "going", performanceId: p.id })}
                        className="btn-secondary min-h-11 px-4 text-[15px]"
                        style={outline}
                      >
                        {status === "going" ? "Go this night instead" : "I’m going"}
                      </button>
                    ))}
                </div>
                {isGoing && calendarLinks(p)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
