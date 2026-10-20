"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
// Supabase loads only when needed, so it isn't part of the page's download
const loadSupabase = () => import("@/lib/supabase/client").then((m) => m.createClient());
import { PositionSelect } from "@/components/PositionSelect";
import {
  addOwnCredit,
  chooseHeadshot,
  claimPage,
  saveBioAndLinks,
  setOwnCreditHidden,
  setOwnCreditRole,
  setOwnPageHidden,
  suggestCorrection,
  type PageLink,
  type Result,
} from "./actions";

// Runs a server action, shows its error, and refreshes the page on success
function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<Result>, onDone?: () => void) => {
    setError(null);
    start(async () => {
      const result = await action();
      if (result.ok) {
        onDone?.();
        router.refresh();
      } else setError(result.error);
    });
  };
  return { pending, error, run };
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="callout m-0 text-[15px]">
      {error}
    </p>
  ) : null;
}

function Field({ label, optional, hint, children }: { label: string; optional?: boolean; hint?: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </label>
      {children(id)}
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </div>
  );
}

const panel = "flex flex-col gap-4 border-l-[3px] border-rule py-1 pl-4";

// ---------------------------------------------------------------------
// "Is this you? Claim this page"
// ---------------------------------------------------------------------
export function ClaimPanel({ personId, slug, name }: { personId: string; slug: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const { pending, error, run } = useAction();

  return (
    <section aria-label="Claim this page" className="-mb-6 flex flex-col gap-3">
      {/* A quiet line until it's needed */}
      {!open ? (
        <p className="m-0 text-sm text-muted">
          Is this you?{" "}
          <button type="button" className="btn-text min-h-0 text-sm" onClick={() => setOpen(true)}>
            Claim this page
          </button>{" "}
          to choose your headshot, write a bio and keep your credits up to date.
        </p>
      ) : (
        <h2 className="subheading">Claim This Page</h2>
      )}
      {open && (
        <div className={panel}>
          <p className="m-0 text-[15px]">
            A moderator checks every claim before {name}’s page is linked to your account. A link that shows it’s you helps.
          </p>
          <Field label="A link that shows it’s you" optional hint="Your own website, or a company cast page that names you.">
            {(id) => <input id={id} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className="field h-12 max-w-[520px] px-3" />}
          </Field>
          <Field label="Anything else the moderator should know" optional>
            {(id) => <textarea id={id} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="field max-w-[520px] p-3" />}
          </Field>
          <ErrorText error={error} />
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => claimPage(personId, slug, url, note))}>
              {pending ? "Sending…" : "Send claim"}
            </button>
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Corrections through the review queue (pending claimants and owners)
// ---------------------------------------------------------------------
export function SuggestCorrection({ personId, slug, currentName, label }: { personId: string; slug: string; currentName: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const { pending, error, run } = useAction();

  if (sent) return <p className="m-0 text-[15px] text-muted">Thanks. Your suggestion is waiting for a moderator.</p>;
  if (!open)
    return (
      <button type="button" className="btn-text self-start" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <div className={panel}>
      <Field label="Name as it should appear" hint="Leave as is if the name is right.">
        {(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} className="field h-12 max-w-[420px] px-3" />}
      </Field>
      <Field label="What else should change?" optional>
        {(id) => <textarea id={id} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="field max-w-[520px] p-3" />}
      </Field>
      <ErrorText error={error} />
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() => run(() => suggestCorrection(personId, slug, name.trim() === currentName ? "" : name, note), () => setSent(true))}
        >
          {pending ? "Sending…" : "Send for review"}
        </button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Bio and links
// ---------------------------------------------------------------------
export function BioLinksEditor({ slug, bio, links }: { slug: string; bio: string; links: PageLink[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(bio);
  const [rows, setRows] = useState<PageLink[]>(links.length ? links : [{ label: "", url: "" }]);
  const { pending, error, run } = useAction();

  if (!open)
    return (
      <button type="button" className="btn-secondary self-start" onClick={() => setOpen(true)}>
        Edit bio and links
      </button>
    );
  return (
    <div className={panel}>
      <Field label="Bio" hint={`${text.length} / 2,000 characters`}>
        {(id) => <textarea id={id} rows={5} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} className="field max-w-[620px] p-3" />}
      </Field>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[15px] font-semibold">
          Links <span className="font-normal text-muted">(up to 5)</span>
        </legend>
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              aria-label={`Link ${i + 1} label`}
              placeholder="Label, e.g. Website"
              value={row.label}
              onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              className="field h-12 w-[180px] px-3"
            />
            <input
              aria-label={`Link ${i + 1} address`}
              type="url"
              placeholder="https://"
              value={row.url}
              onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
              className="field h-12 min-w-0 flex-[1_1_240px] px-3"
            />
            <button type="button" className="btn-text" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        {rows.length < 5 && (
          <button type="button" className="btn-text self-start" onClick={() => setRows((r) => [...r, { label: "", url: "" }])}>
            + Add a link
          </button>
        )}
      </fieldset>
      <ErrorText error={error} />
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => saveBioAndLinks(slug, text, rows), () => setOpen(false))}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Add a missing credit (publishes immediately, labeled "Added by …")
// ---------------------------------------------------------------------
type ProductionMatch = { id: string; label: string; detail: string };

export function AddCreditForm({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ProductionMatch[]>([]);
  const [picked, setPicked] = useState<ProductionMatch | null>(null);
  const [kind, setKind] = useState<"cast" | "crew">("cast");
  const [role, setRole] = useState("");
  const seq = useRef(0);
  const { pending, error, run } = useAction();

  useEffect(() => {
    const q = query.trim();
    if (picked || q.length < 2) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const { data } = await (await loadSupabase()).rpc("lookup_productions", { p_query: q });
      if (mine === seq.current) setMatches(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [query, picked]);

  const reset = () => {
    setOpen(false);
    setQuery("");
    setPicked(null);
    setRole("");
    setMatches([]);
  };

  if (!open)
    return (
      <button type="button" className="btn-text" onClick={() => setOpen(true)}>
        + Add a credit
      </button>
    );
  return (
    <div className={`${panel} mt-3`}>
      <p className="m-0 text-[15px] text-muted">
        Credits you add appear right away, marked “Added by you”. If the production isn’t in the database yet, add it with
        Add a production first.
      </p>
      <Field label="Production">
        {(id) => (
          <div className="flex flex-col gap-1.5">
            <input
              id={id}
              value={picked ? picked.label : query}
              onChange={(e) => {
                setPicked(null);
                setQuery(e.target.value);
              }}
              placeholder="Start typing the show’s title"
              autoComplete="off"
              className="field h-12 max-w-[520px] px-3"
            />
            {!picked && query.trim().length >= 2 && (
              <ul className="m-0 max-w-[520px] list-none overflow-hidden rounded-lg border border-rule p-0">
                {matches.length === 0 && <li className="px-3.5 py-3 text-muted">No productions match yet.</li>}
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(m)}
                      className="flex min-h-12 w-full cursor-pointer flex-col items-start justify-center border-0 border-b border-rule bg-page px-3.5 py-2 text-left text-base hover:bg-soft"
                    >
                      <strong>{m.label}</strong>
                      <span className="text-sm text-muted">{m.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field label="On stage or behind the scenes?">
          {(id) => (
            <select id={id} value={kind} onChange={(e) => setKind(e.target.value as "cast" | "crew")} className="field h-12 px-3">
              <option value="cast">Cast</option>
              <option value="crew">Crew</option>
            </select>
          )}
        </Field>
        <Field label={kind === "cast" ? "Role" : "Position"}>
          {(id) =>
            kind === "crew" ? (
              <PositionSelect id={id} value={role} onChange={setRole} className="field h-12 w-[260px] max-w-full px-3" />
            ) : (
              <input id={id} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Laurie" className="field h-12 w-[260px] max-w-full px-3" />
            )
          }
        </Field>
      </div>
      <ErrorText error={error} />
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          className="btn-primary"
          disabled={pending || !picked || !role.trim()}
          onClick={() => picked && run(() => addOwnCredit(slug, picked.id, kind, role), reset)}
        >
          {pending ? "Adding…" : "Add credit"}
        </button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={reset}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Per-credit controls for the credits table: the role is editable in its
// cell, and an eye button hides or shows the credit on the owner's page
// ---------------------------------------------------------------------
const iconButton =
  "flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-muted hover:bg-soft hover:text-ink";

export function EditableRole({ slug, creditId, role, kind }: { slug: string; creditId: string; role: string; kind: "cast" | "crew" }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(role);
  const { pending, error, run } = useAction();

  if (editing)
    return (
      <div className="flex flex-col gap-2">
        <label className="sr-only" htmlFor={`role-${creditId}`}>
          Role
        </label>
        {kind === "crew" ? (
          <PositionSelect id={`role-${creditId}`} value={value} onChange={setValue} className="field h-12 w-full min-w-[160px] px-3" />
        ) : (
          <input id={`role-${creditId}`} value={value} onChange={(e) => setValue(e.target.value)} className="field h-12 w-full min-w-[160px] px-3" />
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => setOwnCreditRole(slug, creditId, value), () => setEditing(false))}>
            Save
          </button>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
        <ErrorText error={error} />
      </div>
    );
  return (
    <span className="inline-flex items-center gap-1">
      {role}
      <button type="button" aria-label={`Edit the role (${role})`} title="Edit the role" className={`${iconButton} -my-2.5`} onClick={() => setEditing(true)}>
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20h4L19 9l-4-4L4 16v4z" />
          <path d="M13.5 6.5l4 4" />
        </svg>
      </button>
    </span>
  );
}

export function HideCreditToggle({ slug, creditId, hidden }: { slug: string; creditId: string; hidden: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <button
        type="button"
        aria-label={hidden ? "Show this credit on your page" : "Hide this credit from your page"}
        title={hidden ? "Show on your page" : "Hide from your page"}
        className={`${iconButton} -my-2.5 ml-auto`}
        disabled={pending}
        onClick={() => run(() => setOwnCreditHidden(slug, creditId, !hidden))}
      >
        {hidden ? (
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.7 3.3M6.2 7.6C4.2 9.1 3 12 3 12s4 6 9 6c1.4 0 2.7-.4 3.9-1" />
          </svg>
        )}
      </button>
      {error && (
        <span role="alert" className="sr-only">
          {error}
        </span>
      )}
    </>
  );
}

// ---------------------------------------------------------------------
// Choose a headshot from the approved ones
// ---------------------------------------------------------------------
export function HeadshotChooser({ slug, headshots, currentId }: { slug: string; headshots: { id: string; url: string }[]; currentId: string | null }) {
  const { pending, error, run } = useAction();
  if (!headshots.length) return <p className="m-0 text-[15px] text-muted">Approved headshots will appear here to choose from.</p>;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-3 gap-2.5">
        {headshots.map((h, i) => {
          const current = h.id === currentId;
          return (
            <button
              key={h.id}
              type="button"
              aria-label={current ? `Headshot ${i + 1} (current)` : `Use headshot ${i + 1}`}
              aria-pressed={current}
              disabled={pending || current}
              onClick={() => run(() => chooseHeadshot(slug, h.id))}
              className={`aspect-[4/5] cursor-pointer overflow-hidden rounded-md bg-soft p-0 ${current ? "border-[3px] border-ink" : "border border-rule"}`}
            >
              <img src={h.url} alt="" className="h-full w-full object-cover" />
            </button>
          );
        })}
      </div>
      <p className="m-0 text-sm text-muted">Tap one to make it your headshot everywhere on the site.</p>
      <ErrorText error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Hide or restore the whole page
// ---------------------------------------------------------------------
export function HidePageButton({ slug }: { slug: string }) {
  const [confirming, setConfirming] = useState(false);
  const { pending, error, run } = useAction();
  if (!confirming)
    return (
      <button type="button" className="btn-text" onClick={() => setConfirming(true)}>
        Hide my page
      </button>
    );
  return (
    <div role="alertdialog" aria-labelledby="hide-title" className="callout flex max-w-[620px] flex-col gap-3">
      <strong id="hide-title">Hide your page from everyone?</strong>
      <span className="text-[15px]">
        Visitors won’t be able to see your page or find you in search, and your name will no longer appear in the cast and
        crew lists on production pages. Nothing is deleted: you can restore your page at any time from here.
      </span>
      <ErrorText error={error} />
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => setOwnPageHidden(slug, true), () => setConfirming(false))}>
          {pending ? "Hiding…" : "Yes, hide my page"}
        </button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => setConfirming(false)}>
          Keep it visible
        </button>
      </div>
    </div>
  );
}

export function RestorePageButton({ slug }: { slug: string }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <button type="button" className="btn-primary self-start" disabled={pending} onClick={() => run(() => setOwnPageHidden(slug, false))}>
        {pending ? "Restoring…" : "Restore my page"}
      </button>
      <ErrorText error={error} />
    </>
  );
}
