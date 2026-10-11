"use client";

import { useState, useTransition } from "react";
import { calendarFeedToken } from "@/app/follow-actions";

// "Add to my phone's calendar" for one performance: Google, or an .ics file
// that Apple Calendar and Outlook open
export function PhoneCalendarLinks({ google, ics }: { google: string; ics: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="btn-secondary min-h-11 self-start px-4 text-sm">
        Add to my phone’s calendar
      </button>
      {open && (
        <span className="flex flex-col gap-1 text-[15px]">
          <a href={google} target="_blank" rel="noopener noreferrer" className="font-semibold">
            Add to Google Calendar
          </a>
          <a href={ics} download className="font-semibold">
            Download for Apple or Outlook (.ics)
          </a>
        </span>
      )}
    </div>
  );
}

// The private subscription link: every performance you're Going to, kept
// up to date by your calendar app. Resetting makes the old link stop working.
export function SubscribeLink() {
  const [token, setToken] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const load = (reset: boolean) =>
    start(async () => {
      setError("");
      setCopied(false);
      const r = await calendarFeedToken(reset);
      if (r.ok) {
        setToken(r.token);
        setConfirmReset(false);
      } else setError(r.error);
    });

  if (!token) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" disabled={pending} onClick={() => load(false)} className="btn-secondary min-h-11 self-start px-4 text-sm">
          Get my subscription link
        </button>
        {error && <span role="alert" className="text-sm font-semibold">{error}</span>}
      </div>
    );
  }

  const https = `${window.location.origin}/calendar/feed/${token}.ics`;
  const webcal = https.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;

  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor="feed-url" className="text-sm font-semibold">
        Your private link <span className="font-normal text-muted">(anyone with it can see your Going dates)</span>
      </label>
      <div className="flex gap-2">
        <input id="feed-url" readOnly value={https} onFocus={(e) => e.target.select()} className="field min-w-0 flex-1 text-sm" />
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(https).then(() => setCopied(true), () => setError("Couldn’t copy. Select the link and copy it."))}
          className="btn-secondary min-h-12 flex-none px-4 text-sm"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <span className="flex flex-col gap-1 text-[15px]">
        <a href={webcal} className="font-semibold">
          Subscribe in Apple Calendar or Outlook
        </a>
        <a href={google} target="_blank" rel="noopener noreferrer" className="font-semibold">
          Subscribe in Google Calendar
        </a>
      </span>
      {confirmReset ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
          <span>The old link will stop working.</span>
          <button type="button" disabled={pending} onClick={() => load(true)} className="btn-text">
            Reset it
          </button>
          <button type="button" onClick={() => setConfirmReset(false)} className="btn-text text-muted">
            Keep it
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmReset(true)} className="btn-text self-start text-[15px]">
          Reset link
        </button>
      )}
      {error && <span role="alert" className="text-sm font-semibold">{error}</span>}
    </div>
  );
}
