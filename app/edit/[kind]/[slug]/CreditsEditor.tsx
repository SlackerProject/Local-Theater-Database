"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { lookup } from "@/app/add/TypeAhead";
import { personNameKey } from "@/lib/submission";
import { readUnderstudy, splitRoles } from "@/lib/credits";
import type { CreditAdd } from "@/lib/corrections";
import { PositionSelect } from "@/components/PositionSelect";
import { PersonPicker, personProblem, type PersonValue } from "./PersonPicker";
import { CROSS, Icon, PENCIL, PLUS, UNDO, changedRow, input, small } from "./ui";
import { convertToYoungPerformer, youngPerformerPreview, type YoungPreview } from "@/app/moderate/actions";

// One credit as it is now. characterId: the show role a cast credit is
// linked to; understudy: they cover the role rather than play it; young: a
// young performer (under 18), with no person (personId is empty).
export type CreditLine = {
  id: string;
  kind: "cast" | "crew";
  personId: string;
  person: string;
  role: string;
  characterId: string | null;
  understudy: boolean;
  young: boolean;
};
// One of the show's roles; inUse = someone is credited in it (any production)
export type RoleLine = { id: string; name: string; inUse: boolean };

// Everything changed so far in the cast, crew and roles
export type CreditEdits = {
  removed: Set<string>; //                 credit ids
  added: CreditAdd[];
  addedRoles: string[];
  renamedRoles: Record<string, string>; //  role id -> new name
  removedRoles: Set<string>; //             role ids
};

export type CreditOps = {
  setRemoved: (ids: string[], removed: boolean) => void;
  addCredits: (a: CreditAdd[]) => void;
  removeAdded: (indexes: number[]) => void;
  addRoles: (names: string[]) => void;
  removeAddedRole: (i: number) => void;
  renameRole: (id: string, name: string, original: string) => void;
  toggleRemoveRole: (id: string) => void;
};

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
const same = (a: string, b: string) => tidy(a).toLowerCase() === tidy(b).toLowerCase();

// Who an added line names, as a grouping key
const addedKey = (a: CreditAdd) =>
  a.young ? "young" : a.person_id ? `id:${a.person_id}` : `new:${personNameKey(a.new_name ?? "")}`;

function addsFor(kind: "cast" | "crew", roles: string[], understudy: boolean, v: PersonValue): CreditAdd[] {
  return roles.map((role) =>
    "young" in v
      ? { kind: "cast" as const, role, young: true, ...(understudy && { understudy: true }) }
      : "person_id" in v
      ? { kind, role, person_id: v.person_id, person_label: v.person_label, ...(understudy && { understudy: true }) }
      : { kind, role, new_name: v.new_name, adult_confirmed: true, ...(v.distinct && { distinct: true }), ...(understudy && { understudy: true }) },
  );
}

// The person a group is about, to add more roles for them
function groupPerson(g: Group): PersonValue {
  if (g.young) return { young: true };
  if (g.personId) return { person_id: g.personId, person_label: g.name };
  return { new_name: g.name, adult_confirmed: true, clash: false, distinct: !!g.added[0]?.a.distinct };
}

// New people already added in this correction (someone with two roles)
const pendingNewOf = (added: CreditAdd[]) => [...new Set(added.flatMap((a) => (a.new_name ? [a.new_name] : [])))];

// ---------------------------------------------------------------------
// One person and everything they do in this production
// ---------------------------------------------------------------------
type Group = {
  key: string;
  personId: string | null;
  name: string;
  isNew: boolean;
  young: boolean; // a young performer: one line per credit, never named
  lines: CreditLine[]; // as it is now
  added: { a: CreditAdd; i: number }[];
  order: number;
};

function groupCredits(kind: "cast" | "crew", credits: CreditLine[], added: CreditAdd[]): Group[] {
  const groups = new Map<string, Group>();
  credits
    .filter((c) => c.kind === kind)
    .forEach((c, n) => {
      // Young performers aren't one person, so each credit is its own line
      const key = c.young ? `young:${c.id}` : `id:${c.personId}`;
      const g =
        groups.get(key) ??
        { key, personId: c.young ? null : c.personId, name: c.young ? "Young performer" : c.person, isNew: false, young: c.young, lines: [], added: [], order: n };
      g.lines.push(c);
      groups.set(key, g);
    });
  added.forEach((a, i) => {
    if (a.kind !== kind) return;
    const key = a.young ? `young-add:${i}` : addedKey(a);
    const g =
      groups.get(key) ??
      ({
        key,
        personId: a.person_id ?? null,
        name: a.young ? "Young performer" : (a.person_label ?? a.new_name ?? ""),
        isNew: !a.young && !a.person_id,
        young: !!a.young,
        lines: [],
        added: [],
        order: 10000 + i,
      } as Group);
    g.added.push({ a, i });
    groups.set(key, g);
  });
  return [...groups.values()].sort((x, y) => x.order - y.order);
}

// A role as a removable tag
function Chip({
  text,
  understudy,
  state,
  onToggle,
  label,
}: {
  text: string;
  understudy?: boolean;
  state: "now" | "removing" | "adding";
  onToggle: () => void;
  label: string;
}) {
  return (
    <span
      className={`inline-flex min-h-9 items-center gap-1 rounded-md border pl-2.5 text-[15px] ${
        state === "adding" ? "border-ink bg-[#FFF6D6] font-semibold" : state === "removing" ? "border-[#CFCFCF] text-muted" : "border-[#CFCFCF] bg-page"
      }`}
    >
      <span className={state === "removing" ? "line-through" : ""}>
        {understudy && <span className="font-normal text-muted">Understudy for </span>}
        {text}
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-label={state === "removing" ? `Keep ${label}` : `Remove ${label}`}
        className="flex h-9 w-8 cursor-pointer items-center justify-center rounded-r-md border-0 bg-transparent text-muted hover:text-ink"
      >
        <Icon d={state === "removing" ? UNDO : CROSS} />
      </button>
    </span>
  );
}

// Adding more roles (or positions) for someone already listed
function MoreRoles({ kind, onAdd, onCancel }: { kind: "cast" | "crew"; onAdd: (roles: string[], understudy: boolean) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [understudy, setUnderstudy] = useState(false);
  const add = () => {
    const read = readUnderstudy(text);
    const roles = kind === "cast" ? splitRoles(read.text) : [tidy(text)].filter(Boolean);
    if (roles.length) onAdd(roles, kind === "cast" && (understudy || read.understudy));
  };
  return (
    <span className="flex w-full flex-col gap-2">
      {kind === "crew" ? (
        <PositionSelect id={`more-${kind}`} value={text} onChange={setText} className={`${input} max-w-[300px]`} />
      ) : (
        <>
          <input
            aria-label="Roles to add, separated by commas"
            autoFocus
            list="show-roles"
            value={text}
            placeholder="e.g. Bohemian, Pam"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className={`${input} max-w-[320px]`}
          />
          <label className="flex cursor-pointer items-center gap-2 text-[15px]">
            <input type="checkbox" checked={understudy} onChange={(e) => setUnderstudy(e.target.checked)} className="h-5 w-5 accent-ink" />
            Understudy (covers these roles)
          </label>
        </>
      )}
      <span className="flex gap-2">
        <button type="button" onClick={add} className={small}>
          Add
        </button>
        <button type="button" onClick={onCancel} className={small}>
          Cancel
        </button>
      </span>
    </span>
  );
}

// Choosing someone else for every role a person has
function ReplacePerson({
  id,
  pendingNew,
  onDone,
  onCancel,
  allowYoung = false,
}: {
  id: string;
  pendingNew: string[];
  onDone: (v: PersonValue) => void;
  onCancel: () => void;
  allowYoung?: boolean;
}) {
  const [v, setV] = useState<PersonValue | null>(null);
  const [problem, setProblem] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <PersonPicker id={id} value={v} onChange={setV} pendingNew={pendingNew} allowYoung={allowYoung} />
      {problem && <span className="text-sm font-semibold">{problem}</span>}
      <span className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const p = personProblem(v);
            if (p) return setProblem(p);
            onDone(v!);
          }}
          className={small}
        >
          Done
        </button>
        <button type="button" onClick={onCancel} className={small}>
          Cancel
        </button>
      </span>
    </div>
  );
}

// The people in the cast or on the creative team, one line each
function PeopleList({
  kind,
  credits,
  edits,
  ops,
  fresh = false,
  canConvert = false,
}: {
  kind: "cast" | "crew";
  credits: CreditLine[];
  edits: CreditEdits;
  ops: CreditOps;
  fresh?: boolean; // a new production: everything is new, so nothing is marked as a change
  canConvert?: boolean; // moderators: "Convert to young performer"
}) {
  const [open, setOpen] = useState<{ key: string; what: "more" | "replace" | "convert" } | null>(null);
  const groups = groupCredits(kind, credits, edits.added);
  const pendingNew = pendingNewOf(edits.added);
  const roleWord = kind === "cast" ? "role" : "position";

  if (!groups.length) return <p className="m-0 px-2 py-3 text-muted">No one listed yet.</p>;

  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {groups.map((g) => {
        const live = g.lines.filter((l) => !edits.removed.has(l.id));
        const allGone = live.length === 0 && g.added.length === 0;
        const changed = !fresh && (g.added.length > 0 || g.lines.some((l) => edits.removed.has(l.id)));
        // Roles they play first, then the ones they cover
        const lines = [...g.lines].sort((a, b) => Number(a.understudy) - Number(b.understudy));
        const adds = [...g.added].sort((a, b) => Number(!!a.a.understudy) - Number(!!b.a.understudy));
        return (
          <li
            key={g.key}
            className={`grid grid-cols-1 items-start gap-x-4 gap-y-2 border-b border-rule px-2 py-3 md:grid-cols-[13rem_minmax(0,1fr)_auto] ${
              changed ? changedRow : ""
            }`}
          >
            <span className={`flex min-h-9 flex-col justify-center ${allGone ? "text-muted line-through" : ""}`}>
              <strong>{g.name}</strong>
              {g.isNew && <span className="text-sm text-muted">New to the site</span>}
              {g.young && <span className="text-sm text-muted">Under 18 · no name recorded</span>}
            </span>

            {open?.key === g.key && open.what === "convert" ? (
              <ConvertPanel
                creditIds={live.filter((l) => l.kind === "cast").map((l) => l.id)}
                name={g.name}
                onClose={() => setOpen(null)}
              />
            ) : open?.key === g.key && open.what === "replace" ? (
              <ReplacePerson
                id={`replace-${g.key}`}
                pendingNew={pendingNew}
                allowYoung={kind === "cast"}
                onCancel={() => setOpen(null)}
                onDone={(v) => {
                  // Same roles, someone else
                  ops.setRemoved(live.map((l) => l.id), true);
                  ops.removeAdded(g.added.map(({ i }) => i));
                  const plays = [...live.filter((l) => !l.understudy).map((l) => l.role), ...g.added.filter(({ a }) => !a.understudy).map(({ a }) => a.role)];
                  const covers = [...live.filter((l) => l.understudy).map((l) => l.role), ...g.added.filter(({ a }) => a.understudy).map(({ a }) => a.role)];
                  ops.addCredits([...addsFor(kind, plays, false, v), ...addsFor(kind, covers, true, v)]);
                  setOpen(null);
                }}
              />
            ) : (
              <span className="flex flex-wrap items-center gap-1.5">
                {lines.map((l) => (
                  <Chip
                    key={l.id}
                    text={l.role}
                    understudy={l.understudy}
                    state={edits.removed.has(l.id) ? "removing" : "now"}
                    label={`${g.name} as ${l.role}`}
                    onToggle={() => ops.setRemoved([l.id], !edits.removed.has(l.id))}
                  />
                ))}
                {adds.map(({ a, i }) => (
                  <Chip
                    key={`a${i}`}
                    text={a.role}
                    understudy={a.understudy}
                    state={fresh ? "now" : "adding"}
                    label={`${g.name} as ${a.role}`}
                    onToggle={() => ops.removeAdded([i])}
                  />
                ))}
                {open?.key === g.key && open.what === "more" && (
                  <MoreRoles
                    kind={kind}
                    onCancel={() => setOpen(null)}
                    onAdd={(roles, understudy) => {
                      const taken = (r: string) =>
                        live.some((l) => same(l.role, r) && l.understudy === understudy) ||
                        g.added.some(({ a }) => same(a.role, r) && !!a.understudy === understudy);
                      ops.addCredits(addsFor(kind, roles.filter((r) => !taken(r)), understudy, groupPerson(g)));
                      setOpen(null);
                    }}
                  />
                )}
              </span>
            )}

            <span className="flex flex-wrap items-center gap-2 md:justify-end">
              {allGone ? (
                g.lines.length > 0 && (
                  <button type="button" onClick={() => ops.setRemoved(g.lines.map((l) => l.id), false)} className={small}>
                    <Icon d={UNDO} /> Undo
                  </button>
                )
              ) : (
                !open || open.key !== g.key ? (
                  <>
                    {!g.young && (
                      <>
                        <button type="button" onClick={() => setOpen({ key: g.key, what: "more" })} aria-label={`Add a ${roleWord} for ${g.name}`} className={small}>
                          <Icon d={PLUS} /> {kind === "cast" ? "Role" : "Position"}
                        </button>
                        <button type="button" onClick={() => setOpen({ key: g.key, what: "replace" })} aria-label={`Replace ${g.name}`} className={small}>
                          Change person
                        </button>
                      </>
                    )}
                    {canConvert && kind === "cast" && !g.young && live.some((l) => l.kind === "cast") && (
                      <button type="button" onClick={() => setOpen({ key: g.key, what: "convert" })} aria-label={`Convert ${g.name} to a young performer`} className={small}>
                        Convert to young performer
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        ops.setRemoved(live.map((l) => l.id), true);
                        ops.removeAdded(g.added.map(({ i }) => i));
                      }}
                      aria-label={`Remove ${g.name}`}
                      className={small}
                    >
                      <Icon d={CROSS} /> Remove
                    </button>
                  </>
                ) : null
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------
// Cast: who plays what (one line per person), then roles not cast yet
// ---------------------------------------------------------------------
export function CastEditor({
  showTitle,
  credits,
  roles,
  rolesOnly = false,
  fresh = false,
  canConvert = false,
  edits,
  ops,
}: {
  showTitle: string;
  credits: CreditLine[];
  roles: RoleLine[];
  rolesOnly?: boolean; // the show's own page: its roles, without who plays them
  fresh?: boolean; // a new production (the Add form): nothing is marked as a change
  canConvert?: boolean; // moderators can turn a named cast member into a young performer
  edits: CreditEdits;
  ops: CreditOps;
}) {
  const [picking, setPicking] = useState<string | null>(null); // a role choosing its person
  const pendingNew = pendingNewOf(edits.added);
  const roleNames = [
    ...roles.filter((r) => !edits.removedRoles.has(r.id)).map((r) => edits.renamedRoles[r.id] ?? r.name),
    ...edits.addedRoles,
  ];
  const cast = credits.filter((c) => c.kind === "cast");
  // A role is cast once someone plays it here (understudies don't count)
  const isCast = (name: string, id?: string) =>
    cast.some((c) => !c.understudy && !edits.removed.has(c.id) && ((id && c.characterId === id) || same(c.role, name))) ||
    edits.added.some((a) => a.kind === "cast" && !a.understudy && same(a.role, name));
  const uncast = roles.filter((r) => !isCast(edits.renamedRoles[r.id] ?? r.name, r.id));
  const uncastAdded = edits.addedRoles.map((name, i) => ({ name, i })).filter(({ name }) => !isCast(name));

  const changed =
    !fresh &&
    (edits.added.some((a) => a.kind === "cast") ||
    cast.some((c) => edits.removed.has(c.id)) ||
    edits.addedRoles.length > 0 ||
    edits.removedRoles.size > 0 ||
    Object.keys(edits.renamedRoles).length > 0);

  const roleLine = (key: string, name: string, actions: React.ReactNode, nameCell: React.ReactNode, gone = false, isChanged = false) => (
    <li
      key={key}
      className={`grid grid-cols-1 items-start gap-x-4 gap-y-1 border-b border-rule px-2 py-2 md:grid-cols-[13rem_minmax(0,1fr)_auto] ${isChanged ? changedRow : ""}`}
    >
      {nameCell}
      {picking === key ? (
        <ReplacePerson
          id={`pick-${key}`}
          pendingNew={pendingNew}
          allowYoung
          onCancel={() => setPicking(null)}
          onDone={(v) => {
            ops.addCredits(addsFor("cast", [name], false, v));
            setPicking(null);
          }}
        />
      ) : (
        <span className="flex min-h-11 items-center text-muted">{gone ? "Role will be removed" : rolesOnly ? "" : "Not cast yet"}</span>
      )}
      <span className="flex flex-wrap items-center gap-2 md:justify-end">{picking !== key && actions}</span>
    </li>
  );

  return (
    <EditorShell
      id="cast"
      title={rolesOnly ? "Roles" : "Cast"}
      hint={
        rolesOnly
          ? `Every role in ${showTitle}. Each production’s cast is added on the production’s page.`
          : `One line per person, with every role they play (and any they understudy). Roles are shared by all productions of ${showTitle}, so list them even before the cast is known.`
      }
      changed={changed}
    >
      <datalist id="show-roles">
        {roleNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {!rolesOnly && (
        <>
          <ColumnLabels labels={["Person", "Roles"]} wide />
          <PeopleList kind="cast" credits={credits} edits={edits} ops={ops} fresh={fresh} canConvert={canConvert} />
        </>
      )}

      {(uncast.length > 0 || uncastAdded.length > 0 || rolesOnly) && (
        <div className="flex flex-col gap-1">
          {!rolesOnly && <h3 className="subheading mt-2">Roles not cast yet</h3>}
          <ul className="m-0 flex list-none flex-col p-0">
            {uncast.map((r) => {
              const gone = edits.removedRoles.has(r.id);
              const name = edits.renamedRoles[r.id] ?? r.name;
              return roleLine(
                `role-${r.id}`,
                name,
                gone ? (
                  <button type="button" onClick={() => ops.toggleRemoveRole(r.id)} className={small}>
                    <Icon d={UNDO} /> Undo
                  </button>
                ) : (
                  <>
                    {!rolesOnly && (
                      <button type="button" onClick={() => setPicking(`role-${r.id}`)} aria-label={`Add who plays ${name}`} className={small}>
                        <Icon d={PLUS} /> Add person
                      </button>
                    )}
                    {!r.inUse && (
                      <button type="button" onClick={() => ops.toggleRemoveRole(r.id)} aria-label={`Remove the role ${name}`} className={small}>
                        <Icon d={CROSS} /> Remove
                      </button>
                    )}
                  </>
                ),
                gone ? (
                  <span className="flex min-h-11 items-center font-semibold text-muted line-through">{name}</span>
                ) : (
                  <span className="flex flex-col">
                    <RenameRole value={name} changed={r.id in edits.renamedRoles} onSave={(v) => ops.renameRole(r.id, v, r.name)} />
                    {r.id in edits.renamedRoles && <span className="text-sm text-muted">was {r.name}</span>}
                  </span>
                ),
                gone,
                gone || r.id in edits.renamedRoles,
              );
            })}
            {uncastAdded.map(({ name, i }) =>
              roleLine(
                `added-role-${i}`,
                name,
                <>
                  {!rolesOnly && (
                    <button type="button" onClick={() => setPicking(`added-role-${i}`)} aria-label={`Add who plays ${name}`} className={small}>
                      <Icon d={PLUS} /> Add person
                    </button>
                  )}
                  <button type="button" onClick={() => ops.removeAddedRole(i)} aria-label={`Don’t add the role ${name}`} className={small}>
                    <Icon d={CROSS} /> Remove
                  </button>
                </>,
                <span className="flex min-h-11 flex-wrap items-center gap-2 font-bold">
                  {!fresh && <span className="tag">Adding</span>} {name}
                </span>,
                false,
                !fresh,
              ),
            )}
            {rolesOnly && uncast.length === 0 && uncastAdded.length === 0 && <li className="px-2 py-3 text-muted">No roles listed yet.</li>}
          </ul>
        </div>
      )}

      <AddLines kind="cast" rolesOnly={rolesOnly} pendingNew={pendingNew} ops={ops} />
      {roles.some((r) => r.inUse) && !rolesOnly && (
        <p className="m-0 text-sm text-muted">A role someone has played (here or in another production) can be renamed but not removed.</p>
      )}
    </EditorShell>
  );
}

// ---------------------------------------------------------------------
// Creative team & crew: one line per person, with every position
// ---------------------------------------------------------------------
export function CrewEditor({
  credits,
  edits,
  ops,
  fresh = false,
}: {
  credits: CreditLine[];
  edits: CreditEdits;
  ops: CreditOps;
  fresh?: boolean; // a new production (the Add form): nothing is marked as a change
}) {
  const changed = !fresh && (edits.added.some((a) => a.kind === "crew") || credits.some((c) => c.kind === "crew" && edits.removed.has(c.id)));
  return (
    <EditorShell id="crew" title="Creative team & crew" hint="One line per person, with every position they hold." changed={changed}>
      <ColumnLabels labels={["Person", "Positions"]} wide />
      <PeopleList kind="crew" credits={credits} edits={edits} ops={ops} fresh={fresh} />
      <AddLines kind="crew" pendingNew={pendingNewOf(edits.added)} ops={ops} />
    </EditorShell>
  );
}

// Click a role not cast yet to rename it
function RenameRole({ value, changed, onSave }: { value: string; changed: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const save = () => {
    if (tidy(draft)) onSave(tidy(draft));
    setEditing(false);
  };
  if (editing) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <input
          aria-label={`New name for ${value}`}
          autoFocus
          value={draft}
          maxLength={100}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          className={`${input} max-w-[260px]`}
        />
        <button type="button" onClick={save} className={small}>
          Done
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Rename the role ${value}`}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={`group flex min-h-11 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left text-base ${changed ? "font-bold" : "font-semibold"}`}
    >
      <span className="underline decoration-[#CFCFCF] decoration-1 underline-offset-4 group-hover:decoration-ink">{value}</span>
      <span className="text-muted">
        <Icon d={PENCIL} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------
// The frame both lists share
// ---------------------------------------------------------------------
function EditorShell({ id, title, hint, changed, children }: { id: string; title: string; hint: string; changed: boolean; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex flex-col gap-1 border-b-2 border-ink pb-2">
        <h2 id={`${id}-h`} className="heading flex flex-wrap items-center gap-2">
          {title} {changed && <span className="tag">Changed</span>}
        </h2>
        <p className="m-0 text-[15px] text-muted">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function ColumnLabels({ labels, wide }: { labels: [string, string]; wide?: boolean }) {
  return (
    <div
      className={`hidden gap-x-4 px-2 text-sm font-bold text-muted md:grid ${
        wide ? "grid-cols-[13rem_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]"
      }`}
    >
      <span>{labels[0]}</span>
      <span>{labels[1]}</span>
      <span />
    </div>
  );
}

// ---------------------------------------------------------------------
// Adding: someone (with all their roles), a role not cast yet, or a
// whole pasted list
// ---------------------------------------------------------------------
function AddLines({
  kind,
  rolesOnly = false,
  pendingNew,
  ops,
}: {
  kind: "cast" | "crew";
  rolesOnly?: boolean; // roles only, no people (a show's own page)
  pendingNew: string[];
  ops: CreditOps;
}) {
  const [mode, setMode] = useState<"none" | "person" | "role" | "paste">("none");
  const [roles, setRoles] = useState("");
  const [understudy, setUnderstudy] = useState(false);
  const [person, setPerson] = useState<PersonValue | null>(null);
  const [problem, setProblem] = useState("");
  const [paste, setPaste] = useState("");
  const [pasteAdult, setPasteAdult] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setMode("none");
    setRoles("");
    setUnderstudy(false);
    setPerson(null);
    setProblem("");
    setPaste("");
    setPasteAdult(false);
  };

  const rolesFrom = (text: string) => {
    const read = readUnderstudy(text);
    return { list: kind === "cast" ? splitRoles(read.text) : [tidy(text)].filter(Boolean), understudy: kind === "cast" && read.understudy };
  };

  function addPerson() {
    const p = personProblem(person);
    if (p) return setProblem(p);
    const r = rolesFrom(roles);
    if (!r.list.length) return setProblem(kind === "cast" ? "Enter at least one role." : "Choose the position.");
    ops.addCredits(addsFor(kind, r.list, understudy || r.understudy, person!));
    close();
  }

  function addRole() {
    const list = splitRoles(roles);
    if (!list.length) return setProblem("Enter the role.");
    ops.addRoles(list);
    close();
  }

  // "Roles: Person" per line; for the cast, a line with no person adds the role(s)
  async function addPasted() {
    const lines = paste
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        if (rolesOnly) return { role: tidy(l), person: "" };
        // The name is after the last colon or tab (or " - "), so roles can hold commas and dashes
        const cut = [...l.matchAll(/\s*[:\t]\s*/g)].at(-1) ?? [...l.matchAll(/\s[-–—]\s/g)].at(-1);
        return cut?.index ? { role: tidy(l.slice(0, cut.index)), person: tidy(l.slice(cut.index + cut[0].length)) } : { role: tidy(l), person: "" };
      });
    if (!lines.length) return setProblem("Paste at least one line.");
    if (kind === "crew" && lines.some((l) => !l.person)) return setProblem("Each line needs a position and a person, like “Director: Jane Doe”.");
    setBusy(true);
    setProblem("");
    // Someone already on the site with exactly that name is used, not added again
    const resolved = await Promise.all(
      lines.map(async (l) => {
        if (!l.person) return { ...l, existing: null };
        const found = await lookup("people", l.person);
        return { ...l, existing: found.find((m) => personNameKey(m.label) === personNameKey(l.person)) ?? null };
      }),
    );
    setBusy(false);
    const needsNew = resolved.filter((l) => l.person && !l.existing && !pendingNew.some((n) => personNameKey(n) === personNameKey(l.person)));
    if (needsNew.length && !pasteAdult) {
      return setProblem(
        `${[...new Set(needsNew.map((l) => l.person))].join(", ")} ${needsNew.length === 1 ? "is" : "are"} new to the site. Tick the box to confirm everyone new is 18 or older.`,
      );
    }
    const newRoles: string[] = [];
    const adds: CreditAdd[] = [];
    for (const l of resolved) {
      const r = rolesFrom(l.role);
      if (!l.person) {
        newRoles.push(...(kind === "cast" ? r.list : []));
        continue;
      }
      const v: PersonValue = l.existing
        ? { person_id: l.existing.id, person_label: l.existing.label }
        : { new_name: l.person, adult_confirmed: true, clash: false, distinct: false };
      for (const a of addsFor(kind, r.list, r.understudy, v)) {
        // The same person in the same role once
        if (!adds.some((x) => addedKey(x) === addedKey(a) && same(x.role, a.role) && !!x.understudy === !!a.understudy)) adds.push(a);
      }
    }
    if (adds.length) ops.addCredits(adds);
    if (newRoles.length) ops.addRoles(newRoles);
    close();
  }

  if (mode === "person") {
    return (
      <div className="flex max-w-[640px] flex-col gap-3 border border-[#CFCFCF] bg-page p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`add-${kind}-person`} className="text-sm font-bold">
            Person
          </label>
          <PersonPicker id={`add-${kind}-person`} value={person} onChange={setPerson} pendingNew={pendingNew} allowYoung={kind === "cast"} />
        </div>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {kind === "cast" ? (
            <>
              <span>
                Roles <span className="font-normal text-muted">(separate several with commas)</span>
              </span>
              <input
                list="show-roles"
                value={roles}
                placeholder="e.g. Mrs. Jefferson, Bohemian"
                onChange={(e) => setRoles(e.target.value)}
                className={`${input} font-normal`}
              />
            </>
          ) : (
            <>
              Position
              <PositionSelect id={`add-${kind}-role`} value={roles} onChange={setRoles} className={`${input} max-w-[300px] font-normal`} />
            </>
          )}
        </label>
        {kind === "cast" && (
          <label className="flex cursor-pointer items-center gap-2 text-[15px]">
            <input type="checkbox" checked={understudy} onChange={(e) => setUnderstudy(e.target.checked)} className="h-5 w-5 accent-ink" />
            Understudy (covers these roles rather than playing them)
          </label>
        )}
        {problem && <span className="text-sm font-semibold">{problem}</span>}
        <span className="flex gap-2">
          <button type="button" onClick={addPerson} className={small}>
            Add
          </button>
          <button type="button" onClick={close} className={small}>
            Cancel
          </button>
        </span>
      </div>
    );
  }

  if (mode === "role") {
    return (
      <div className="flex max-w-[640px] flex-col gap-3 border border-[#CFCFCF] bg-page p-3">
        <label className="flex flex-col gap-1 text-sm font-bold">
          <span>
            Roles <span className="font-normal text-muted">(separate several with commas)</span>
          </span>
          <input
            autoFocus
            value={roles}
            placeholder="e.g. Monty Navarro, Sibella Hallward"
            onChange={(e) => setRoles(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRole();
              }
            }}
            className={`${input} font-normal`}
          />
        </label>
        {problem && <span className="text-sm font-semibold">{problem}</span>}
        <span className="flex gap-2">
          <button type="button" onClick={addRole} className={small}>
            Add
          </button>
          <button type="button" onClick={close} className={small}>
            Cancel
          </button>
        </span>
      </div>
    );
  }

  if (mode === "paste") {
    return (
      <div className="flex max-w-[640px] flex-col gap-2 border border-[#CFCFCF] bg-page p-3">
        <label htmlFor={`paste-${kind}`} className="text-sm font-bold">
          {rolesOnly ? "Paste the roles, one per line" : `Paste the ${kind === "cast" ? "cast" : "creative team"} list, one per line`}
        </label>
        <span className="text-sm text-muted">
          {rolesOnly ? (
            "One role per line."
          ) : kind === "cast" ? (
            <>
              Like <em>Mrs. Jefferson, Bohemian: Wynter Williams</em> or <em>Understudy - Joanne Jefferson: Wynter Williams</em>. Lines
              for the same person are put together. A line with only roles adds them, not cast yet. Names already on the site are
              matched to their pages.
            </>
          ) : (
            <>
              Like <em>Director: Jane Doe</em>. Names already on the site are matched to their pages.
            </>
          )}
        </span>
        <textarea id={`paste-${kind}`} rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} className="field w-full p-3" />
        {!rolesOnly && (
          <label className="flex cursor-pointer items-start gap-2.5 text-[15px]">
            <input type="checkbox" checked={pasteAdult} onChange={(e) => setPasteAdult(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-ink" />
            Everyone new to the site in this list is 18 or older.
          </label>
        )}
        {problem && <span className="text-sm font-semibold">{problem}</span>}
        <span className="flex gap-2">
          <button type="button" disabled={busy} onClick={addPasted} className={small}>
            {busy ? "Checking names…" : "Add these"}
          </button>
          <button type="button" onClick={close} className={small}>
            Cancel
          </button>
        </span>
      </div>
    );
  }

  return (
    <span className="flex flex-wrap gap-2">
      {!rolesOnly && (
        <button type="button" onClick={() => setMode("person")} className={small}>
          <Icon d={PLUS} /> {kind === "cast" ? "Add someone to the cast" : "Add someone to the team"}
        </button>
      )}
      {kind === "cast" && (
        <button type="button" onClick={() => setMode("role")} className={small}>
          <Icon d={PLUS} /> {rolesOnly ? "Add roles" : "Add roles not cast yet"}
        </button>
      )}
      <button type="button" onClick={() => setMode("paste")} className={small}>
        <Icon d={PLUS} /> {rolesOnly ? "Paste a list of roles" : "Paste a whole list"}
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------
// Moderators: turn a named cast member into a young performer. Shows what
// will be removed first; the change happens at once (not on Save).
// ---------------------------------------------------------------------
function ConvertPanel({ creditIds, name, onClose }: { creditIds: string[]; name: string; onClose: () => void }) {
  const router = useRouter();
  const [preview, setPreview] = useState<YoungPreview | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    youngPerformerPreview(creditIds).then((r) => {
      if (!live) return;
      if (r.ok) setPreview(r.people);
      else setProblem(r.error);
    });
    return () => {
      live = false;
    };
  }, [creditIds]);

  const p = preview?.[0];
  return (
    <div className="callout flex flex-col gap-2 text-[15px]">
      <strong>Convert {name} to a young performer?</strong>
      <span>
        Their {creditIds.length === 1 ? "role" : `${creditIds.length} roles`} here will be listed as “Young performer”, with no name, link
        or photo.
      </span>
      {!preview && !problem && <span className="text-muted">Checking what this affects…</span>}
      {p &&
        (p.willDelete ? (
          <span className="font-semibold">
            {name} has no other credits, so their page{p.photos ? ` and ${p.photos} ${p.photos === 1 ? "photo" : "photos"}` : ""} will be
            deleted permanently, and their name removed from the site’s records. This can’t be undone.
          </span>
        ) : p.claimed ? (
          <span>{name} has claimed their page, so it stays; only these credits change.</span>
        ) : (
          <span>
            {name}’s page stays, because they have {p.otherCredits} other {p.otherCredits === 1 ? "credit" : "credits"}; only these credits
            change.
          </span>
        ))}
      {problem && (
        <span role="alert" className="font-semibold">
          {problem}
        </span>
      )}
      <span className="flex gap-2">
        <button
          type="button"
          disabled={!preview || busy}
          onClick={async () => {
            setBusy(true);
            const r = await convertToYoungPerformer(creditIds, window.location.pathname);
            setBusy(false);
            if (!r.ok) return setProblem(r.error ?? "That didn’t work.");
            onClose();
            router.refresh();
          }}
          className="btn-primary min-h-10 px-4 text-[15px]"
        >
          {busy ? "Converting…" : "Convert"}
        </button>
        <button type="button" onClick={onClose} className={small}>
          Cancel
        </button>
      </span>
    </div>
  );
}
