"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePage, type DeleteTable } from "@/app/moderate/actions";

const NOUN: Record<DeleteTable, string> = {
  productions: "production",
  people: "person",
  organizations: "company",
  shows: "show",
  locations: "venue",
};
const PLURAL: Record<string, string> = { people: "People", shows: "Show", organizations: "Company", locations: "Venue" };

// A moderator's "Delete this page": explains what goes with it, asks once
// more, then deletes permanently. Blocked while productions still use it.
export function ModeratorDelete({
  table,
  id,
  name,
  blockers,
  leftovers,
  afterDelete,
}: {
  table: DeleteTable;
  id: string;
  name: string;
  blockers: { slug: string; label: string }[];
  leftovers: { entity_table: string; label: string }[];
  afterDelete: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [withLeftovers, setWithLeftovers] = useState(true);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const noun = NOUN[table];

  function remove() {
    setError("");
    start(async () => {
      const r = await deletePage(table, id, table === "productions" && withLeftovers && leftovers.length > 0);
      if (r.ok) router.push(afterDelete);
      else setError(r.error ?? "That didn’t work.");
    });
  }

  return (
    <section className="flex flex-col gap-3 border-t border-rule pt-6">
      <h2 className="subheading">Moderator</h2>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary self-start">
          Delete this {noun}
        </button>
      ) : blockers.length ? (
        <div className="callout flex flex-col gap-2">
          <strong>Delete its productions first.</strong>
          <span className="text-[15px]">
            This {noun} is still used by {blockers.length} {blockers.length === 1 ? "production" : "productions"}:
          </span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {blockers.map((b) => (
              <li key={b.slug}>
                <Link href={`/production/${b.slug}`} className="font-semibold">
                  {b.label}
                </Link>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setOpen(false)} className="btn-text self-start">
            Close
          </button>
        </div>
      ) : (
        <div className="callout flex flex-col gap-3">
          <strong>Permanently delete {name}?</strong>
          <span className="text-[15px]">
            {table === "productions" && "Its cast and crew credits, performance dates, auditions, photos and poster go with it. "}
            {table === "people" && "Their credits, headshots and any claim on the page go with it. "}
            This can’t be undone from the site.
          </span>
          {table === "productions" && leftovers.length > 0 && (
            <label className="flex cursor-pointer items-start gap-2.5 text-[15px]">
              <input
                type="checkbox"
                checked={withLeftovers}
                onChange={(e) => setWithLeftovers(e.target.checked)}
                className="mt-0.5 h-5 w-5 flex-none accent-ink"
              />
              <span>
                Also delete what only this production used:{" "}
                <strong>{leftovers.map((l) => `${l.label} (${(PLURAL[l.entity_table] ?? l.entity_table).toLowerCase()})`).join(", ")}</strong>
              </span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={remove} className="btn-primary">
              {pending ? "Deleting…" : `Yes, delete this ${noun}`}
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
        </div>
      )}
    </section>
  );
}
