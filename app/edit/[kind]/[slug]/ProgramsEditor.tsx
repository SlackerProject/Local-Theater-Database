"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { addProgram, removeProgram, updateProgram } from "@/app/edit/programs-actions";

export type Program = { id: string; name: string; for_kids: boolean; count: number };

const small = "min-h-10 px-4 text-sm";

// A company's programs (moderators): add, rename, mark for kids, remove
export function ProgramsEditor({ organizationId, slug, programs }: { organizationId: string; slug: string; programs: Program[] }) {
  return (
    <section aria-labelledby="programs-h" className="flex flex-col gap-3">
      <div className="border-b-2 border-ink pb-2">
        <h2 id="programs-h" className="heading">
          Programs
        </h2>
      </div>
      {programs.length > 0 && (
        <ul className="m-0 flex list-none flex-col border-t border-rule p-0">
          {programs.map((p) => (
            <ProgramRow key={p.id} slug={slug} program={p} />
          ))}
        </ul>
      )}
      <ProgramForm label="Add program" onSave={(name, kids) => addProgram(organizationId, slug, name, kids)} />
    </section>
  );
}

function ProgramRow({ slug, program }: { slug: string; program: Program }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (editing)
    return (
      <li className="border-b border-rule py-3">
        <ProgramForm
          label="Save"
          initial={program}
          onSave={async (name, kids) => {
            const r = await updateProgram(program.id, slug, name, kids);
            if (r.ok) setEditing(false);
            return r;
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule py-2.5">
      <span className="min-w-0 flex-1">
        <strong>{program.name}</strong>
        <span className="text-sm text-muted">
          {program.for_kids && " · For kids (not listed)"}
          {` · ${program.count} production${program.count === 1 ? "" : "s"}`}
        </span>
      </span>
      {asking ? (
        <span className="flex flex-wrap items-center gap-2 text-[15px]">
          Remove it?
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await removeProgram(program.id, slug);
                if (r.ok) router.refresh();
                else setError(r.error);
              })
            }
            className={`btn-primary ${small}`}
          >
            Remove
          </button>
          <button type="button" onClick={() => setAsking(false)} className={`btn-secondary ${small}`}>
            Cancel
          </button>
        </span>
      ) : (
        <>
          <button type="button" onClick={() => setEditing(true)} className="btn-text text-sm">
            Edit
          </button>
          <button type="button" onClick={() => setAsking(true)} className="btn-text text-sm">
            Remove
          </button>
        </>
      )}
      {error && <span className="w-full text-sm font-semibold text-alert">{error}</span>}
    </li>
  );
}

function ProgramForm({
  label,
  initial,
  onSave,
  onCancel,
}: {
  label: string;
  initial?: Program;
  onSave: (name: string, kids: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [kids, setKids] = useState(initial?.for_kids ?? false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        Program name
      </label>
      <input id={id} value={name} onChange={(e) => setName(e.target.value)} className="field h-11 w-full max-w-[460px] px-3" />
      <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[15px]">
        <input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} className="h-5 w-5 accent-ink" />
        For kids
      </label>
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={() =>
            start(async () => {
              setError("");
              const r = await onSave(name, kids);
              if (!r.ok) return setError(r.error);
              if (!initial) {
                setName("");
                setKids(false);
              }
              router.refresh();
            })
          }
          className={`btn-primary ${small}`}
        >
          {pending ? "Saving…" : label}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={`btn-secondary ${small}`}>
            Cancel
          </button>
        )}
        {error && <span className="text-sm font-semibold text-alert">{error}</span>}
      </span>
    </div>
  );
}
