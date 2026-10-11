"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { suggestEdit, type SuggestTable } from "@/app/suggest-actions";

// "Spot something wrong or missing? Suggest an edit" at the bottom of a
// page. Productions also get a shortcut to add cast, crew, dates or a poster
// through the Add form, so new people are credited properly.
export function SuggestEdit({
  table,
  id,
  path,
  signedIn,
  addToHref,
}: {
  table: SuggestTable;
  id: string;
  path: string;
  signedIn: boolean;
  addToHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const noteId = useId();

  if (!signedIn) {
    return (
      <p className="m-0 border-t border-rule pt-5 text-[15px] text-muted">
        Spot something wrong or missing?{" "}
        <Link href={`/signin?next=${encodeURIComponent(path)}`} className="font-semibold text-ink">
          Sign in to suggest an edit
        </Link>
      </p>
    );
  }

  if (sent) {
    return (
      <p role="status" className="callout m-0 text-[15px]">
        Thanks! Your suggestion was sent to the moderators.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-3 border-t border-rule pt-5">
      {!open ? (
        <p className="m-0 flex flex-wrap items-center gap-x-3 text-[15px] text-muted">
          Spot something wrong or missing?
          <button type="button" onClick={() => setOpen(true)} className="btn-text text-[15px]">
            Suggest an edit
          </button>
        </p>
      ) : (
        <>
          <h2 className="subheading">Suggest an edit</h2>
          {addToHref && (
            <div className="flex flex-col gap-1.5">
              <Link href={addToHref} className="btn-secondary self-start">
                Add cast, crew, dates or a poster
              </Link>
              <span className="text-sm text-muted">
                Opens the Add form for this production. A moderator reviews it, then everyone is credited.
              </span>
            </div>
          )}
          <label htmlFor={noteId} className="text-[15px] font-semibold">
            {addToHref ? "Or describe a correction" : "What should change?"}{" "}
            <span className="font-normal text-muted">(sent to the moderators)</span>
          </label>
          <textarea
            id={noteId}
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. The closing night is Nov 16, not Nov 15."
            className="field max-w-[620px] p-3"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError("");
                  const r = await suggestEdit(table, id, note);
                  if (r.ok) setSent(true);
                  else setError(r.error ?? "That didn’t work.");
                })
              }
              className="btn-primary"
            >
              Send suggestion
            </button>
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
          {error && (
            <p role="alert" className="m-0 font-semibold">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
