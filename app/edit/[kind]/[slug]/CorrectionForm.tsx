"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { lookup, type LookupKind } from "@/app/add/TypeAhead";
import { SHOW_TYPES, type Match } from "@/lib/submission";
import {
  hasChanges,
  performanceText,
  type Changes,
  type CreditAdd,
  type FieldDef,
  type FieldValue,
  type PageTable,
  type PerformanceEdit,
} from "@/lib/corrections";
import { submitCorrection } from "@/app/edit/actions";
import { TownPicker } from "@/components/TownPicker";
import { maTown } from "@/lib/ma-towns";
import { CastEditor, CrewEditor, type CreditEdits, type CreditLine, type CreditOps, type RoleLine } from "./CreditsEditor";
import { CROSS, Icon, PENCIL, PLUS, UNDO, changedRow, input, small } from "./ui";

export type { CreditLine, RoleLine };
export type PerformanceLine = { id: string; date: string; time: string; label: string; cancelled: boolean };

// Plain and clear over stylish: bordered tables with a label column for
// the details, role | person lists for the cast and crew, and buttons
// that say what they do.
const th = "w-[34%] max-w-[220px] border-b border-[#CFCFCF] bg-soft p-3 text-left align-top font-bold md:w-[210px]";
const td = "border-b border-[#CFCFCF] p-3 align-top";

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div className="border-b-2 border-ink pb-2">
      <h2 id={id} className="heading">
        {children}
      </h2>
    </div>
  );
}

export function CorrectionForm({
  table,
  id,
  pagePath,
  fields,
  current,
  labels,
  locked,
  credits,
  performances,
  roles,
  showTitle,
  isModerator,
}: {
  table: PageTable;
  id: string;
  pagePath: string;
  fields: FieldDef[];
  current: Record<string, FieldValue>;
  labels: Record<string, string>;
  locked: Record<string, string>;
  credits?: CreditLine[];
  performances?: PerformanceLine[];
  roles?: RoleLine[];
  showTitle?: string;
  isModerator: boolean;
}) {
  // Only what has changed is kept
  const [edits, setEdits] = useState<Record<string, FieldValue>>({});
  const [editLabels, setEditLabels] = useState<Record<string, string>>({});
  const [removedCredits, setRemovedCredits] = useState<Set<string>>(new Set());
  const [roleChanges, setRoleChanges] = useState<Record<string, string>>({});
  const [addedCredits, setAddedCredits] = useState<CreditAdd[]>([]);
  const [removedPerfs, setRemovedPerfs] = useState<Set<string>>(new Set());
  const [perfChanges, setPerfChanges] = useState<Record<string, PerformanceEdit & { id: string }>>({});
  const [addedPerfs, setAddedPerfs] = useState<PerformanceEdit[]>([]);
  const [addedRoles, setAddedRoles] = useState<string[]>([]);
  const [renamedRoles, setRenamedRoles] = useState<Record<string, string>>({});
  const [removedRoles, setRemovedRoles] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [result, setResult] = useState<"published" | "pending" | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const changes: Changes = {
    ...(Object.keys(edits).length && { fields: edits }),
    ...(table === "productions" && {
      credits: {
        add: addedCredits,
        remove: [...removedCredits],
        update: Object.entries(roleChanges).map(([cid, role]) => ({ id: cid, role })),
      },
      performances: { add: addedPerfs, remove: [...removedPerfs], update: Object.values(perfChanges) },
    }),
    ...(roles && {
      roles: {
        add: addedRoles,
        rename: Object.entries(renamedRoles).map(([rid, name]) => ({ id: rid, name })),
        remove: [...removedRoles],
      },
    }),
  };
  const changed = hasChanges(changes);

  // The cast and crew lists edit these through ops
  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) =>
    set((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const creditEdits: CreditEdits = {
    removed: removedCredits,
    roleChanges,
    added: addedCredits,
    addedRoles,
    renamedRoles,
    removedRoles,
  };
  const ops: CreditOps = {
    toggleRemoveCredit: (cid) => toggle(setRemovedCredits, cid),
    setCreditRole: (cid, role, original) =>
      setRoleChanges((r) => {
        const next = { ...r };
        if (!role.trim() || role.trim() === original) delete next[cid];
        else next[cid] = role.trim();
        return next;
      }),
    addCredit: (a) => setAddedCredits((list) => [...list, a]),
    removeAdded: (i) => setAddedCredits((list) => list.filter((_, j) => j !== i)),
    addRoles: (names) =>
      setAddedRoles((list) => {
        // Not twice, and not a role the show already has
        const taken = new Set(
          [...(roles ?? []).filter((r) => !removedRoles.has(r.id)).map((r) => renamedRoles[r.id] ?? r.name), ...list].map((n) => n.toLowerCase()),
        );
        const fresh: string[] = [];
        for (const n of names) {
          if (!taken.has(n.toLowerCase())) {
            taken.add(n.toLowerCase());
            fresh.push(n);
          }
        }
        return [...list, ...fresh];
      }),
    removeAddedRole: (i) => setAddedRoles((list) => list.filter((_, j) => j !== i)),
    renameRole: (rid, name, original) =>
      setRenamedRoles((r) => {
        const next = { ...r };
        if (!name || name === original) delete next[rid];
        else next[rid] = name;
        return next;
      }),
    toggleRemoveRole: (rid) => toggle(setRemovedRoles, rid),
  };

  function submit() {
    setError("");
    if (!changed && !note.trim()) {
      setError("Nothing has changed yet. Change something above, or write a note for the moderator.");
      return;
    }
    start(async () => {
      const r = await submitCorrection(table, id, changes, note, pagePath);
      if (r.ok) {
        setResult(r.published ? "published" : "pending");
        window.scrollTo({ top: 0 });
      } else setError(r.error);
    });
  }

  if (result) {
    return (
      <div role="status" className="callout flex flex-col gap-3">
        <strong className="text-lg">{result === "published" ? "Changes saved." : "Thanks! Your correction was sent."}</strong>
        <span>
          {result === "published"
            ? "They’re live on the page now."
            : "A moderator will review it. You’ll see it on the page once it’s approved, and you’ll earn points."}
        </span>
        <Link href={pagePath} className="btn-primary self-start">
          Back to the page
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Details */}
      {fields.length > 0 && (
        <section aria-labelledby="details-h" className="flex flex-col gap-3">
          <SectionHeading id="details-h">Details</SectionHeading>
          <table className="w-full border-collapse border border-[#CFCFCF] text-[15px]">
            <tbody>
              {fields.map((f) => (
                <FieldRow
                  key={f.key}
                  field={f}
                  value={f.key in edits ? edits[f.key] : current[f.key]}
                  display={f.key in editLabels ? editLabels[f.key] : labels[f.key]}
                  original={current[f.key]}
                  originalDisplay={labels[f.key]}
                  changed={f.key in edits}
                  locked={locked[f.key]}
                  onChange={(v, label) => {
                    const same = (v ?? "") === (current[f.key] ?? "");
                    setEdits((e) => {
                      const next = { ...e };
                      if (same) delete next[f.key];
                      else next[f.key] = v;
                      return next;
                    });
                    if (label !== undefined) setEditLabels((l) => ({ ...l, [f.key]: label }));
                  }}
                  onUndo={() =>
                    setEdits((e) => {
                      const next = { ...e };
                      delete next[f.key];
                      return next;
                    })
                  }
                />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Cast: the show's roles and who plays them (a show's page lists just the roles) */}
      {roles && (
        <CastEditor
          showTitle={showTitle ?? "this show"}
          credits={credits ?? []}
          roles={roles}
          rolesOnly={!credits}
          edits={creditEdits}
          ops={ops}
        />
      )}

      {credits && <CrewEditor credits={credits} edits={creditEdits} ops={ops} />}

      {performances && (
        <section aria-labelledby="performances-h" className="flex flex-col gap-3">
          <SectionHeading id="performances-h">Performances</SectionHeading>
          <table className="w-full border-collapse border border-[#CFCFCF] text-[15px]">
            <tbody>
              <PerformancesRow
                lines={performances}
                removed={removedPerfs}
                changes={perfChanges}
                added={addedPerfs}
                onToggleRemove={(pid) => toggle(setRemovedPerfs, pid)}
                onChange={(p, original) =>
                  setPerfChanges((c) => {
                    const next = { ...c };
                    const same = p.date === original.date && p.time === original.time && p.label === original.label && !!p.cancelled === original.cancelled;
                    if (same) delete next[p.id];
                    else next[p.id] = p;
                    return next;
                  })
                }
                onAdd={(p) => setAddedPerfs((list) => [...list, p])}
                onRemoveAdded={(i) => setAddedPerfs((list) => list.filter((_, j) => j !== i))}
              />
            </tbody>
          </table>
        </section>
      )}

      <section aria-labelledby="note-h" className="flex flex-col gap-3">
        <SectionHeading id="note-h">Notes to moderator</SectionHeading>
        <label htmlFor="note" className="text-[15px] text-muted">
          Where does this come from? A program, a website link, a cast list…
        </label>
        <textarea id="note" rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className="field w-full max-w-[620px] p-3" />
      </section>

      {/* Save stays in reach while scrolling */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-[#CFCFCF] bg-page px-4 py-3 shadow-[0_-6px_18px_rgba(0,0,0,0.06)] md:-mx-8 md:px-8">
        {error && (
          <p role="alert" className="callout m-0 font-semibold">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={pending} onClick={submit} className="btn-primary min-h-11">
            {pending ? "Sending…" : isModerator ? "Save changes" : "Submit correction"}
          </button>
          <Link href={pagePath} className="font-semibold">
            Cancel
          </Link>
          <span className="text-sm text-muted" aria-live="polite">
            {changed ? "Changes are highlighted in yellow." : "No changes yet."}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// One field: shows the value with an Edit button; while editing, an input
// ---------------------------------------------------------------------
function show(value: FieldValue, display?: string) {
  if (display) return display;
  if (value === null || value === "") return null;
  const v = String(value);
  // Dates read as "Fri, Oct 30, 2026"
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return new Date(`${v}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  return v;
}

function FieldRow({
  field,
  value,
  display,
  original,
  originalDisplay,
  changed,
  locked,
  onChange,
  onUndo,
}: {
  field: FieldDef;
  value: FieldValue;
  display?: string;
  original: FieldValue;
  originalDisplay?: string;
  changed: boolean;
  locked?: string;
  onChange: (v: FieldValue, label?: string) => void;
  onUndo: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value === null ? "" : String(value));
  const [draftLabel, setDraftLabel] = useState<string | undefined>(display);
  const [problem, setProblem] = useState("");
  const shown = show(value, field.input === "showType" ? SHOW_TYPES.find((t) => t.value === value)?.label : display);
  const inputId = `f-${field.key}`;

  function done() {
    const raw = draft.trim().replace(/\s+/g, " ");
    let v: FieldValue = raw === "" ? null : raw;
    setProblem("");
    if (field.input === "number" && raw !== "") v = Number(raw);
    if (field.input === "state") v = "MA";
    if (field.input === "town" && raw) {
      const town = maTown(raw);
      if (!town) return setProblem("Choose the city or town from the Massachusetts list.");
      v = town;
    }
    if (field.input === "zip" && raw && !/^\d{5}(-\d{4})?$/.test(raw)) return setProblem("The ZIP code should be 5 digits, like 02081.");
    if (field.required && v === null) return;
    onChange(v, field.input === "company" || field.input === "venue" ? draftLabel : undefined);
    setEditing(false);
  }

  return (
    <tr className={changed ? changedRow : ""}>
      <th scope="row" className={th}>
        <label htmlFor={editing ? inputId : undefined}>{field.label}</label>
        {field.hint && <span className="mt-1 block text-sm font-normal text-muted">{field.hint}</span>}
      </th>
      <td className={td}>
        {locked ? (
          <span>
            {shown ?? <span className="text-muted">—</span>} <span className="text-sm text-muted">({locked})</span>
          </span>
        ) : editing ? (
          <div className="flex flex-col gap-2">
            <FieldInputBox field={field} id={inputId} value={draft} label={draftLabel} onValue={setDraft} onLabel={setDraftLabel} />
            {field.required && !draft.trim() && <span className="text-sm font-semibold">This can’t be left empty.</span>}
            {problem && (
              <span role="alert" className="text-sm font-semibold">
                {problem}
              </span>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={done} className={small}>
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(value === null ? "" : String(value));
                  setDraftLabel(display);
                  setEditing(false);
                }}
                className={small}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
            <button
              type="button"
              onClick={() => {
                setDraft(value === null ? "" : String(value));
                setDraftLabel(display);
                setEditing(true);
              }}
              aria-label={`Edit ${field.label}`}
              className={small}
            >
              <Icon d={PENCIL} /> Edit
            </button>
            <span className={`min-w-0 flex-1 whitespace-pre-line pt-1.5 ${changed ? "font-bold" : ""}`}>
              {shown ?? <span className="font-normal text-muted">— (empty)</span>}
            </span>
            {changed && (
              <span className="flex w-full flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">
                  Was: {show(original, field.input === "showType" ? SHOW_TYPES.find((t) => t.value === original)?.label : originalDisplay) ?? "empty"}
                </span>
                <button type="button" onClick={onUndo} className={small}>
                  <Icon d={UNDO} /> Undo
                </button>
              </span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function FieldInputBox({
  field,
  id,
  value,
  label,
  onValue,
  onLabel,
}: {
  field: FieldDef;
  id: string;
  value: string;
  label?: string;
  onValue: (v: string) => void;
  onLabel: (l: string) => void;
}) {
  switch (field.input) {
    case "longtext":
      return <textarea id={id} rows={5} value={value} onChange={(e) => onValue(e.target.value)} className="field w-full max-w-[620px] p-3" />;
    case "number":
      return <input id={id} type="number" inputMode="numeric" value={value} onChange={(e) => onValue(e.target.value)} className={`${input} max-w-[160px]`} />;
    case "date":
      return <input id={id} type="date" value={value} onChange={(e) => onValue(e.target.value)} className={`${input} max-w-[200px]`} />;
    case "url":
      return <input id={id} type="url" placeholder="https://" value={value} onChange={(e) => onValue(e.target.value)} className={input} />;
    case "state":
      // Massachusetts only, for now
      return (
        <select id={id} value="MA" onChange={() => onValue("MA")} className={`${input} max-w-[110px]`}>
          <option value="MA">MA</option>
        </select>
      );
    case "town":
      return <TownPicker id={id} value={value} onChange={onValue} className={`${input} max-w-[300px]`} />;
    case "zip":
      return (
        <input id={id} inputMode="numeric" maxLength={10} placeholder="02081" value={value} onChange={(e) => onValue(e.target.value)} className={`${input} max-w-[140px]`} />
      );
    case "street":
      return <input id={id} placeholder="e.g. 2 Scout Road" value={value} onChange={(e) => onValue(e.target.value)} className={input} />;
    case "showType":
      return (
        <select id={id} value={value} onChange={(e) => onValue(e.target.value)} className={`${input} max-w-[240px]`}>
          {SHOW_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      );
    case "company":
    case "venue":
      return (
        <Picker
          id={id}
          kind={field.input === "company" ? "organizations" : "locations"}
          noun={field.input}
          current={label}
          onPick={(m) => {
            onValue(m.id);
            onLabel(m.label);
          }}
          onClear={field.required ? undefined : () => { onValue(""); onLabel(""); }}
        />
      );
    default:
      return <input id={id} value={value} onChange={(e) => onValue(e.target.value)} className={input} />;
  }
}

// Search existing companies, venues or people and pick one
function Picker({
  id,
  kind,
  noun,
  current,
  onPick,
  onClear,
  placeholder,
}: {
  id: string;
  kind: LookupKind;
  noun: string;
  current?: string;
  onPick: (m: Match) => void;
  onClear?: () => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => lookup(kind, q).then((m) => live && setMatches(m)), 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [kind, q]);

  return (
    <div className="flex flex-col gap-2">
      {current && (
        <span className="text-sm">
          Chosen: <strong>{current}</strong>
          {onClear && (
            <button type="button" onClick={onClear} className={`${small} ml-2`}>
              Clear
            </button>
          )}
        </span>
      )}
      <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder ?? `Search for a ${noun}`} className={input} />
      {matches.length > 0 && (
        <ul className="m-0 flex max-w-[460px] list-none flex-col border border-[#CFCFCF] p-0">
          {matches.map((m) => (
            <li key={m.id} className="border-b border-[#CFCFCF] last:border-b-0">
              <button
                type="button"
                onClick={() => {
                  onPick(m);
                  setQ("");
                  setMatches([]);
                }}
                className="flex w-full cursor-pointer flex-col border-0 bg-page px-3 py-2 text-left hover:bg-soft"
              >
                <span className="font-semibold">{m.label}</span>
                {m.detail && <span className="text-sm text-muted">{m.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && matches.length === 0 && <span className="text-sm text-muted">No {noun} matches “{q.trim()}”.</span>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Performance dates
// ---------------------------------------------------------------------
function PerformancesRow({
  lines,
  removed,
  changes,
  added,
  onToggleRemove,
  onChange,
  onAdd,
  onRemoveAdded,
}: {
  lines: PerformanceLine[];
  removed: Set<string>;
  changes: Record<string, PerformanceEdit & { id: string }>;
  added: PerformanceEdit[];
  onToggleRemove: (id: string) => void;
  onChange: (p: PerformanceEdit & { id: string }, original: PerformanceLine) => void;
  onAdd: (p: PerformanceEdit) => void;
  onRemoveAdded: (i: number) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const any = added.length > 0 || removed.size > 0 || Object.keys(changes).length > 0;

  return (
    <tr id="performances" className={any ? changedRow : ""}>
      <th scope="row" className={th}>
        Performances
        <span className="mt-1 block text-sm font-normal text-muted">Massachusetts time.</span>
      </th>
      <td className={td}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {lines.map((l) => {
            const gone = removed.has(l.id);
            const now = changes[l.id] ?? { ...l };
            if (editing === l.id) {
              return (
                <li key={l.id}>
                  <PerformanceEditor
                    initial={now}
                    onDone={(p) => {
                      onChange({ ...p, id: l.id }, l);
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                    allowCancelled
                  />
                </li>
              );
            }
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onToggleRemove(l.id)} className={small}>
                  <Icon d={gone ? UNDO : CROSS} /> {gone ? "Undo" : "Remove"}
                </button>
                <span className={`${gone ? "text-muted line-through" : ""} ${l.id in changes ? "font-bold" : ""}`}>
                  {performanceText(now.date, now.time)}
                  {now.label && ` · ${now.label}`}
                  {now.cancelled && " · Cancelled"}
                </span>
                {l.id in changes && <span className="text-sm text-muted">was {performanceText(l.date, l.time)}{l.label && ` · ${l.label}`}</span>}
                {gone ? (
                  <span className="text-sm font-semibold">Will be removed</span>
                ) : (
                  <button type="button" onClick={() => setEditing(l.id)} className={small}>
                    <Icon d={PENCIL} /> Edit
                  </button>
                )}
              </li>
            );
          })}
          {added.map((p, i) => (
            <li key={`new-${i}`} className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => onRemoveAdded(i)} className={small}>
                <Icon d={CROSS} /> Remove
              </button>
              <span className="tag">Adding</span>
              <span className="font-bold">
                {performanceText(p.date, p.time)}
                {p.label && ` · ${p.label}`}
              </span>
            </li>
          ))}
          {lines.length === 0 && added.length === 0 && <li className="text-muted">No dates listed yet.</li>}
        </ul>
        <div className="mt-3">
          {adding ? (
            <PerformanceEditor
              initial={{ date: "", time: "19:30", label: "" }}
              onDone={(p) => {
                onAdd(p);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button type="button" onClick={() => setAdding(true)} className={small}>
              <Icon d={PLUS} /> Add a performance
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function PerformanceEditor({
  initial,
  onDone,
  onCancel,
  allowCancelled = false,
}: {
  initial: PerformanceEdit;
  onDone: (p: PerformanceEdit) => void;
  onCancel: () => void;
  allowCancelled?: boolean;
}) {
  const [p, setP] = useState<PerformanceEdit>(initial);
  const [problem, setProblem] = useState("");
  return (
    <div className="flex max-w-[620px] flex-col gap-3 border border-[#CFCFCF] bg-page p-3">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Date
          <input type="date" value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} className={`${input} w-[180px]`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Curtain
          <input type="time" value={p.time} onChange={(e) => setP({ ...p, time: e.target.value })} className={`${input} w-[150px]`} />
        </label>
        <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-sm font-bold">
          Label <span className="font-normal text-muted">(optional)</span>
          <input value={p.label} placeholder="e.g. Opening night" onChange={(e) => setP({ ...p, label: e.target.value })} className={input} />
        </label>
      </div>
      {allowCancelled && (
        <label className="flex cursor-pointer items-center gap-2.5 text-[15px]">
          <input type="checkbox" checked={!!p.cancelled} onChange={(e) => setP({ ...p, cancelled: e.target.checked })} className="h-5 w-5 accent-ink" />
          This performance was cancelled
        </label>
      )}
      {problem && <span className="text-sm font-semibold">{problem}</span>}
      <div className="flex gap-2">
        <button type="button" onClick={() => (p.date ? onDone(p) : setProblem("Choose a date."))} className={small}>
          Done
        </button>
        <button type="button" onClick={onCancel} className={small}>
          Cancel
        </button>
      </div>
    </div>
  );
}
