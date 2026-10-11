"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setAuditionFollow, submitAuditions, type AuditionSession } from "@/app/follow-actions";

export type AuditionRow = {
  id: string;
  label: string | null;
  when: string;
  venue: { slug: string; name: string } | null;
  place: string | null;
  past: boolean;
};
export type LocationOption = { id: string; name: string; town: string | null };

// Suggestions for a session's label; anything else can be typed
const SESSION_LABELS = ["Auditions", "Dance audition", "Vocal audition", "Callbacks", "Open call"];

// A production before its cast is announced: audition dates (or "TBD"),
// "Remind me about auditions", and a form anyone can use to add the dates.
export function Auditions({
  productionId,
  path,
  signedIn,
  precast,
  sessions,
  editable,
  locations,
  defaultLocationId,
  note,
  url,
  following: initiallyFollowing,
  pendingMine,
  canPublish,
}: {
  productionId: string;
  path: string;
  signedIn: boolean;
  precast: boolean;
  sessions: AuditionRow[];
  editable: AuditionSession[];
  locations: LocationOption[];
  defaultLocationId: string;
  note: string | null;
  url: string | null;
  following: boolean;
  pendingMine: boolean;
  canPublish: boolean;
}) {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState(pendingMine ? "Your audition dates are waiting for a moderator." : "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const signInHref = `/signin?next=${encodeURIComponent(path)}`;
  const upcoming = sessions.filter((s) => !s.past);

  function toggleFollow() {
    const next = !following;
    setFollowing(next);
    setError("");
    start(async () => {
      const r = await setAuditionFollow(productionId, next, path);
      if (!r.ok) {
        setFollowing(!next);
        setError(r.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="heading">Auditions</h2>
        {precast && <span className="tag">Casting soon</span>}
      </div>

      {sessions.length ? (
        <ul className="m-0 flex list-none flex-col border-t border-rule p-0">
          {sessions.map((s) => (
            <li key={s.id} className={`flex flex-wrap items-baseline justify-between gap-x-4 border-b border-rule py-2.5 ${s.past ? "text-muted" : ""}`}>
              <span className="flex flex-col">
                <span className="font-bold">{s.label ?? "Auditions"}</span>
                <span>{s.when}</span>
              </span>
              {s.venue ? (
                <Link href={`/venue/${s.venue.slug}`} className={s.past ? "text-muted" : ""}>
                  {s.venue.name}
                </Link>
              ) : (
                s.place && <span className="text-muted">{s.place}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0">
          <strong>Audition dates:</strong> TBD
        </p>
      )}
      {note && <p className="m-0 max-w-[620px] whitespace-pre-line">{note}</p>}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="self-start font-semibold">
          Audition sign-up and details
        </a>
      )}

      {!editing && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {(precast || upcoming.length > 0) &&
            (!signedIn ? (
              <Link href={signInHref} className="btn-primary">
                Remind me about auditions
              </Link>
            ) : (
              <button
                type="button"
                disabled={pending}
                aria-pressed={following}
                onClick={toggleFollow}
                className={`${following ? "btn-secondary" : "btn-primary"} gap-2`}
              >
                {following && (
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
                {following ? "You’ll be reminded" : "Remind me about auditions"}
              </button>
            ))}
          {signedIn ? (
            <button type="button" onClick={() => setEditing(true)} className="btn-text">
              {sessions.length || note || url ? "Update audition details" : "Add audition dates"}
            </button>
          ) : (
            <Link href={signInHref} className="btn-text">
              Sign in to add audition dates
            </Link>
          )}
        </div>
      )}
      {following && !editing && (
        <p className="m-0 text-sm text-muted">
          Audition dates go on <Link href="/calendar">your calendar</Link>, and you’ll get a notification when they’re posted.
        </p>
      )}

      {editing && (
        <AuditionForm
          initial={editable}
          locations={locations}
          defaultLocationId={defaultLocationId}
          note={note ?? ""}
          url={url ?? ""}
          canPublish={canPublish}
          onCancel={() => setEditing(false)}
          onSubmit={(sessions, note, url) =>
            new Promise<string | null>((resolve) =>
              start(async () => {
                const r = await submitAuditions(productionId, sessions, note, url, path);
                if (r.ok) {
                  setEditing(false);
                  setMessage(r.published ? "Audition details published." : "Thanks! A moderator will review your audition dates.");
                  resolve(null);
                } else resolve(r.error);
              }),
            )
          }
        />
      )}
      {message && !editing && (
        <p role="status" className="callout m-0 text-[15px]">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 font-semibold">
          {error}
        </p>
      )}
    </section>
  );
}

const emptySession = (locationId: string): AuditionSession => ({ date: "", start: "19:00", end: "", label: "", locationId });

// "Where": the site's locations, grouped by town
function LocationSelect({ value, locations, onChange }: { value: string; locations: LocationOption[]; onChange: (id: string) => void }) {
  const towns = [...new Set(locations.map((l) => l.town ?? "Other"))].sort((a, b) => a.localeCompare(b));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="field h-12 w-full px-3">
      <option value="">Not given</option>
      {towns.map((town) => (
        <optgroup key={town} label={town}>
          {locations
            .filter((l) => (l.town ?? "Other") === town)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

function AuditionForm({
  initial,
  locations,
  defaultLocationId,
  note: initialNote,
  url: initialUrl,
  canPublish,
  onCancel,
  onSubmit,
}: {
  initial: AuditionSession[];
  locations: LocationOption[];
  defaultLocationId: string;
  note: string;
  url: string;
  canPublish: boolean;
  onCancel: () => void;
  onSubmit: (sessions: AuditionSession[], note: string, url: string) => Promise<string | null>;
}) {
  const [rows, setRows] = useState<AuditionSession[]>(initial.length ? initial : [emptySession(defaultLocationId)]);
  const [note, setNote] = useState(initialNote);
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<AuditionSession>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  async function save() {
    setBusy(true);
    setError((await onSubmit(rows, note, url)) ?? "");
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4 border-y border-rule py-5">
      <p className="m-0 text-[15px] text-muted">
        Add each audition session. Leave the list empty if the dates aren’t announced yet; the page will say “TBD”.
        {canPublish ? " Your changes publish right away." : " A moderator will check them before they appear."}
      </p>
      <datalist id="audition-session-labels">
        {SESSION_LABELS.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      {rows.map((row, i) => (
        <fieldset key={i} className="m-0 flex flex-wrap items-end gap-3 border-0 border-l-[3px] border-solid border-rule p-0 pl-4">
          <legend className="sr-only">Session {i + 1}</legend>
          <label className="flex w-full flex-col gap-1 text-sm font-semibold">
            <span>
              What is this session? <span className="font-normal text-muted">(optional, e.g. Dance audition, Callbacks)</span>
            </span>
            <input
              type="text"
              list="audition-session-labels"
              value={row.label}
              maxLength={60}
              placeholder="Auditions"
              onChange={(e) => update(i, { label: e.target.value })}
              className="field h-12 max-w-[320px] px-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Date
            <input type="date" value={row.date} onChange={(e) => update(i, { date: e.target.value })} className="field h-12 w-[170px] px-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Starts
            <input type="time" value={row.start} onChange={(e) => update(i, { start: e.target.value })} className="field h-12 w-[150px] px-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Ends <span className="sr-only">(optional)</span>
            <input type="time" value={row.end} onChange={(e) => update(i, { end: e.target.value })} className="field h-12 w-[150px] px-3" />
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm font-semibold">
            Where
            <LocationSelect value={row.locationId} locations={locations} onChange={(locationId) => update(i, { locationId })} />
          </label>
          <button type="button" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} className="btn-text min-h-12">
            Remove
          </button>
        </fieldset>
      ))}
      <p className="m-0 text-sm text-muted">
        “Where” lists the locations already on the site. If yours isn’t there, leave it as “Not given” and say where in the details below.
      </p>
      <button
        type="button"
        // A new session starts at the same place as the one before it
        onClick={() => setRows((r) => [...r, emptySession(r.at(-1)?.locationId ?? defaultLocationId)])}
        className="btn-text self-start"
      >
        + Add another session
      </button>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Details <span className="font-normal text-muted">(optional: roles, what to prepare, callbacks)</span>
        <textarea value={note} maxLength={2000} rows={3} onChange={(e) => setNote(e.target.value)} className="field p-3 text-base" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Sign-up link <span className="font-normal text-muted">(optional)</span>
        <input type="url" value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} className="field h-12 max-w-[520px] px-3" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={save} className="btn-primary">
          {canPublish ? "Publish audition details" : "Send for review"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="callout m-0 text-[15px]">
          {error}
        </p>
      )}
    </div>
  );
}
