"use client";

import { useId, useState } from "react";
import { lookup } from "@/app/add/TypeAhead";
import { personNameKey } from "@/lib/submission";
import type { CreditAdd } from "@/lib/corrections";
import { PositionSelect } from "@/components/PositionSelect";
import { PersonPicker, personProblem, type PersonValue } from "./PersonPicker";
import { CROSS, Icon, PENCIL, PLUS, UNDO, changedRow, input, small } from "./ui";

// characterId: the show role a cast credit is linked to
export type CreditLine = { id: string; kind: "cast" | "crew"; person: string; role: string; characterId: string | null };
// One of the show's roles; inUse = someone is credited in it (any production)
export type RoleLine = { id: string; name: string; inUse: boolean };

// Everything changed so far in the cast, crew and roles
export type CreditEdits = {
  removed: Set<string>; //                 credit ids
  roleChanges: Record<string, string>; //   credit id -> new role
  added: CreditAdd[];
  addedRoles: string[];
  renamedRoles: Record<string, string>; //  role id -> new name
  removedRoles: Set<string>; //             role ids
};

export type CreditOps = {
  toggleRemoveCredit: (id: string) => void;
  setCreditRole: (id: string, role: string, original: string) => void;
  addCredit: (a: CreditAdd) => void;
  removeAdded: (i: number) => void;
  addRoles: (names: string[]) => void;
  removeAddedRole: (i: number) => void;
  renameRole: (id: string, name: string, original: string) => void;
  toggleRemoveRole: (id: string) => void;
};

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
const same = (a: string, b: string) => tidy(a).toLowerCase() === tidy(b).toLowerCase();

function toCreditAdd(kind: "cast" | "crew", role: string, v: PersonValue): CreditAdd {
  return "person_id" in v
    ? { kind, role: tidy(role), person_id: v.person_id, person_label: v.person_label }
    : { kind, role: tidy(role), new_name: v.new_name, adult_confirmed: true, ...(v.distinct && { distinct: true }) };
}

// New people already added in this correction (someone with two roles)
const pendingNewOf = (added: CreditAdd[]) => [...new Set(added.flatMap((a) => (a.new_name ? [a.new_name] : [])))];

// ---------------------------------------------------------------------
// Click to change: a role or position shown as text with a pencil
// ---------------------------------------------------------------------
function EditableText({
  value,
  label,
  changed,
  crew = false,
  suggestions,
  onSave,
}: {
  value: string;
  label: string; // "Role for Jane Doe"
  changed?: boolean;
  crew?: boolean;
  suggestions?: string; // datalist id
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputId = useId();
  const save = () => {
    if (tidy(draft)) onSave(tidy(draft));
    setEditing(false);
  };
  if (editing) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {crew ? (
          <PositionSelect id={inputId} value={draft} onChange={setDraft} className={`${input} max-w-[260px]`} />
        ) : (
          <input
            aria-label={label}
            autoFocus
            list={suggestions}
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
        )}
        <button type="button" onClick={save} className={small}>
          Done
        </button>
        <button type="button" onClick={() => setEditing(false)} className={small}>
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Change ${label}: ${value || "empty"}`}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={`group flex min-h-11 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left text-base ${changed ? "font-bold" : "font-semibold"}`}
    >
      <span className="underline decoration-[#CFCFCF] decoration-1 underline-offset-4 group-hover:decoration-ink">{value || "(no role)"}</span>
      <span className="text-muted">
        <Icon d={PENCIL} />
      </span>
    </button>
  );
}

// One line of the list: role | person | buttons
function Line({ children, changed, struck }: { children: React.ReactNode; changed?: boolean; struck?: boolean }) {
  return (
    <li
      className={`grid grid-cols-1 items-start gap-x-4 gap-y-1 border-b border-rule px-2 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] ${
        changed ? changedRow : ""
      } ${struck ? "text-muted [&>span:not(:last-child)]:line-through" : ""}`}
    >
      {children}
    </li>
  );
}

function Buttons({ children }: { children: React.ReactNode }) {
  return <span className="flex flex-wrap items-center gap-2 no-underline md:justify-end">{children}</span>;
}

// Picking a person for a line (to fill a role, or to replace someone)
function PickPerson({
  id,
  pendingNew,
  onDone,
  onCancel,
  doneLabel = "Done",
}: {
  id: string;
  pendingNew: string[];
  onDone: (v: PersonValue) => void;
  onCancel: () => void;
  doneLabel?: string;
}) {
  const [v, setV] = useState<PersonValue | null>(null);
  const [problem, setProblem] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <PersonPicker id={id} value={v} onChange={setV} pendingNew={pendingNew} />
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
          {doneLabel}
        </button>
        <button type="button" onClick={onCancel} className={small}>
          Cancel
        </button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------
// Cast: every role in the show, with who plays it (or "Not cast yet")
// ---------------------------------------------------------------------
type CastItem =
  | { t: "credit"; c: CreditLine }
  | { t: "role"; r: RoleLine }
  | { t: "added"; a: CreditAdd; i: number }
  | { t: "addedRole"; name: string; i: number };

export function CastEditor({
  showTitle,
  credits,
  roles,
  rolesOnly = false,
  edits,
  ops,
}: {
  showTitle: string;
  credits: CreditLine[];
  roles: RoleLine[];
  rolesOnly?: boolean; // the show's own page: its roles, without who plays them
  edits: CreditEdits;
  ops: CreditOps;
}) {
  const [picking, setPicking] = useState<string | null>(null); // line key choosing a person
  const pendingNew = pendingNewOf(edits.added);
  const roleNames = [
    ...roles.filter((r) => !edits.removedRoles.has(r.id)).map((r) => edits.renamedRoles[r.id] ?? r.name),
    ...edits.addedRoles,
  ];

  // In the show's role order: who plays each role, then roles not cast yet.
  // A role this production credits, or that an added line fills, isn't
  // also shown as "Not cast yet".
  const order = (name: string, characterId?: string | null) => {
    const byId = characterId ? roles.findIndex((r) => r.id === characterId) : -1;
    if (byId >= 0) return byId;
    const byName = roleNames.findIndex((n) => same(n, name));
    return byName >= 0 ? (byName < roles.length ? byName : roles.length + byName) : 10000;
  };
  const castNow = credits.filter((c) => c.kind === "cast");
  const filled = (name: string, id?: string) =>
    castNow.some((c) => (id && c.characterId === id) || same(c.role, name)) ||
    edits.added.some((a) => a.kind === "cast" && same(a.role, name));
  const items: { item: CastItem; at: number; tie: number }[] = [
    ...castNow.map((c, n) => ({ item: { t: "credit", c } as CastItem, at: order(c.role, c.characterId), tie: n })),
    ...roles.filter((r) => !filled(r.name, r.id)).map((r) => ({ item: { t: "role", r } as CastItem, at: order(r.name, r.id), tie: 0 })),
    ...edits.added
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.kind === "cast")
      .map(({ a, i }) => ({ item: { t: "added", a, i } as CastItem, at: order(a.role), tie: 1000 + i })),
    ...edits.addedRoles
      .map((name, i) => ({ name, i }))
      .filter(({ name }) => !filled(name))
      .map(({ name, i }) => ({ item: { t: "addedRole", name, i } as CastItem, at: order(name), tie: 2000 + i })),
  ];
  items.sort((x, y) => x.at - y.at || x.tie - y.tie);

  const changed =
    edits.added.some((a) => a.kind === "cast") ||
    castNow.some((c) => edits.removed.has(c.id) || c.id in edits.roleChanges) ||
    edits.addedRoles.length > 0 ||
    edits.removedRoles.size > 0 ||
    Object.keys(edits.renamedRoles).length > 0;

  return (
    <EditorShell
      id="cast"
      title={rolesOnly ? "Roles" : "Cast"}
      hint={
        rolesOnly
          ? `Every role in ${showTitle}. Each production’s cast is added on the production’s page.`
          : `Every role in ${showTitle}, and who plays it. Roles are shared by all productions of the show, so list them even before the cast is known.`
      }
      changed={changed}
      headings={rolesOnly ? ["Role", ""] : ["Role", "Person"]}
    >
      <datalist id="show-roles">
        {roleNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <ul className="m-0 flex list-none flex-col p-0">
        {items.map(({ item }) => {
          if (item.t === "credit") {
            const c = item.c;
            const gone = edits.removed.has(c.id);
            const role = edits.roleChanges[c.id] ?? c.role;
            const key = `credit-${c.id}`;
            return (
              <Line key={key} changed={gone || c.id in edits.roleChanges} struck={gone}>
                {gone ? (
                  <span className="flex min-h-11 items-center font-semibold">{role}</span>
                ) : (
                  <span className="flex flex-col">
                    <EditableText
                      value={role}
                      label={`${c.person}’s role`}
                      changed={c.id in edits.roleChanges}
                      suggestions="show-roles"
                      onSave={(v) => ops.setCreditRole(c.id, v, c.role)}
                    />
                    {c.id in edits.roleChanges && <span className="text-sm font-normal text-muted no-underline">was {c.role}</span>}
                  </span>
                )}
                {picking === key ? (
                  <PickPerson
                    id={`pick-${key}`}
                    pendingNew={pendingNew}
                    doneLabel="Replace"
                    onCancel={() => setPicking(null)}
                    onDone={(v) => {
                      ops.toggleRemoveCredit(c.id);
                      ops.addCredit(toCreditAdd("cast", role, v));
                      setPicking(null);
                    }}
                  />
                ) : (
                  <span className="flex min-h-11 items-center">{c.person}</span>
                )}
                <Buttons>
                  {gone ? (
                    <>
                      <span className="text-sm font-semibold no-underline">Will be removed</span>
                      <button type="button" onClick={() => ops.toggleRemoveCredit(c.id)} className={small}>
                        <Icon d={UNDO} /> Undo
                      </button>
                    </>
                  ) : (
                    picking !== key && (
                      <>
                        <button type="button" onClick={() => setPicking(key)} aria-label={`Replace ${c.person} as ${role}`} className={small}>
                          Change person
                        </button>
                        <button type="button" onClick={() => ops.toggleRemoveCredit(c.id)} aria-label={`Remove ${c.person} from ${role}`} className={small}>
                          <Icon d={CROSS} /> Remove
                        </button>
                      </>
                    )
                  )}
                </Buttons>
              </Line>
            );
          }

          if (item.t === "role") {
            const r = item.r;
            const gone = edits.removedRoles.has(r.id);
            const name = edits.renamedRoles[r.id] ?? r.name;
            const key = `role-${r.id}`;
            return (
              <Line key={key} changed={gone || r.id in edits.renamedRoles} struck={gone}>
                {gone ? (
                  <span className="flex min-h-11 items-center font-semibold">{name}</span>
                ) : (
                  <span className="flex flex-col">
                    <EditableText
                      value={name}
                      label={`the role ${r.name}`}
                      changed={r.id in edits.renamedRoles}
                      onSave={(v) => ops.renameRole(r.id, v, r.name)}
                    />
                    {r.id in edits.renamedRoles && <span className="text-sm font-normal text-muted">was {r.name}</span>}
                  </span>
                )}
                {picking === key ? (
                  <PickPerson
                    id={`pick-${key}`}
                    pendingNew={pendingNew}
                    onCancel={() => setPicking(null)}
                    onDone={(v) => {
                      ops.addCredit(toCreditAdd("cast", name, v));
                      setPicking(null);
                    }}
                  />
                ) : (
                  <span className="flex min-h-11 items-center text-muted">{gone ? "Role will be removed" : rolesOnly ? "" : "Not cast yet"}</span>
                )}
                <Buttons>
                  {gone ? (
                    <button type="button" onClick={() => ops.toggleRemoveRole(r.id)} className={small}>
                      <Icon d={UNDO} /> Undo
                    </button>
                  ) : (
                    picking !== key && (
                      <>
                        {!rolesOnly && (
                          <button type="button" onClick={() => setPicking(key)} aria-label={`Add who plays ${name}`} className={small}>
                            <Icon d={PLUS} /> Add person
                          </button>
                        )}
                        {!r.inUse && (
                          <button type="button" onClick={() => ops.toggleRemoveRole(r.id)} aria-label={`Remove the role ${name}`} className={small}>
                            <Icon d={CROSS} /> Remove
                          </button>
                        )}
                      </>
                    )
                  )}
                </Buttons>
              </Line>
            );
          }

          if (item.t === "added") {
            const { a, i } = item;
            return (
              <Line key={`added-${i}`} changed>
                <span className="flex min-h-11 flex-wrap items-center gap-2 font-bold">
                  <span className="tag">Adding</span> {a.role}
                </span>
                <span className="flex min-h-11 flex-col justify-center">
                  <strong>{a.person_label ?? a.new_name}</strong>
                  {!a.person_id && <span className="text-sm text-muted">New to the site{a.distinct && ", a different person from the one with the same name"}</span>}
                </span>
                <Buttons>
                  <button type="button" onClick={() => ops.removeAdded(i)} aria-label={`Don’t add ${a.person_label ?? a.new_name}`} className={small}>
                    <Icon d={CROSS} /> Remove
                  </button>
                </Buttons>
              </Line>
            );
          }

          const { name, i } = item;
          const key = `addedRole-${i}`;
          return (
            <Line key={key} changed>
              <span className="flex min-h-11 flex-wrap items-center gap-2 font-bold">
                <span className="tag">Adding</span> {name}
              </span>
              {picking === key ? (
                <PickPerson
                  id={`pick-${key}`}
                  pendingNew={pendingNew}
                  onCancel={() => setPicking(null)}
                  onDone={(v) => {
                    ops.addCredit(toCreditAdd("cast", name, v));
                    setPicking(null);
                  }}
                />
              ) : (
                <span className="flex min-h-11 items-center text-muted">{rolesOnly ? "" : "Not cast yet"}</span>
              )}
              <Buttons>
                {picking !== key && (
                  <>
                    {!rolesOnly && (
                      <button type="button" onClick={() => setPicking(key)} aria-label={`Add who plays ${name}`} className={small}>
                        <Icon d={PLUS} /> Add person
                      </button>
                    )}
                    <button type="button" onClick={() => ops.removeAddedRole(i)} aria-label={`Don’t add the role ${name}`} className={small}>
                      <Icon d={CROSS} /> Remove
                    </button>
                  </>
                )}
              </Buttons>
            </Line>
          );
        })}
        {items.length === 0 && <li className="px-2 py-3 text-muted">No roles listed yet.</li>}
      </ul>
      <AddLines kind="cast" rolesOnly={rolesOnly} pendingNew={pendingNew} ops={ops} />
      {roles.some((r) => r.inUse) && (
        <p className="m-0 text-sm text-muted">A role someone has played (here or in another production) can be renamed but not removed.</p>
      )}
    </EditorShell>
  );
}

// ---------------------------------------------------------------------
// Creative team & crew: position | person
// ---------------------------------------------------------------------
export function CrewEditor({ credits, edits, ops }: { credits: CreditLine[]; edits: CreditEdits; ops: CreditOps }) {
  const [picking, setPicking] = useState<string | null>(null);
  const pendingNew = pendingNewOf(edits.added);
  const crew = credits.filter((c) => c.kind === "crew");
  const added = edits.added.map((a, i) => ({ a, i })).filter(({ a }) => a.kind === "crew");
  const changed = added.length > 0 || crew.some((c) => edits.removed.has(c.id) || c.id in edits.roleChanges);

  return (
    <EditorShell id="crew" title="Creative team & crew" hint="Director, music director, stage manager…" changed={changed} headings={["Position", "Person"]}>
      <ul className="m-0 flex list-none flex-col p-0">
        {crew.map((c) => {
          const gone = edits.removed.has(c.id);
          const role = edits.roleChanges[c.id] ?? c.role;
          const key = `credit-${c.id}`;
          return (
            <Line key={key} changed={gone || c.id in edits.roleChanges} struck={gone}>
              {gone ? (
                <span className="flex min-h-11 items-center font-semibold">{role}</span>
              ) : (
                <span className="flex flex-col">
                  <EditableText
                    value={role}
                    label={`${c.person}’s position`}
                    crew
                    changed={c.id in edits.roleChanges}
                    onSave={(v) => ops.setCreditRole(c.id, v, c.role)}
                  />
                  {c.id in edits.roleChanges && <span className="text-sm font-normal text-muted">was {c.role}</span>}
                </span>
              )}
              {picking === key ? (
                <PickPerson
                  id={`pick-${key}`}
                  pendingNew={pendingNew}
                  doneLabel="Replace"
                  onCancel={() => setPicking(null)}
                  onDone={(v) => {
                    ops.toggleRemoveCredit(c.id);
                    ops.addCredit(toCreditAdd("crew", role, v));
                    setPicking(null);
                  }}
                />
              ) : (
                <span className="flex min-h-11 items-center">{c.person}</span>
              )}
              <Buttons>
                {gone ? (
                  <>
                    <span className="text-sm font-semibold no-underline">Will be removed</span>
                    <button type="button" onClick={() => ops.toggleRemoveCredit(c.id)} className={small}>
                      <Icon d={UNDO} /> Undo
                    </button>
                  </>
                ) : (
                  picking !== key && (
                    <>
                      <button type="button" onClick={() => setPicking(key)} aria-label={`Replace ${c.person} as ${role}`} className={small}>
                        Change person
                      </button>
                      <button type="button" onClick={() => ops.toggleRemoveCredit(c.id)} aria-label={`Remove ${c.person} (${role})`} className={small}>
                        <Icon d={CROSS} /> Remove
                      </button>
                    </>
                  )
                )}
              </Buttons>
            </Line>
          );
        })}
        {added.map(({ a, i }) => (
          <Line key={`added-${i}`} changed>
            <span className="flex min-h-11 flex-wrap items-center gap-2 font-bold">
              <span className="tag">Adding</span> {a.role}
            </span>
            <span className="flex min-h-11 flex-col justify-center">
              <strong>{a.person_label ?? a.new_name}</strong>
              {!a.person_id && <span className="text-sm text-muted">New to the site</span>}
            </span>
            <Buttons>
              <button type="button" onClick={() => ops.removeAdded(i)} aria-label={`Don’t add ${a.person_label ?? a.new_name}`} className={small}>
                <Icon d={CROSS} /> Remove
              </button>
            </Buttons>
          </Line>
        ))}
        {crew.length === 0 && added.length === 0 && <li className="px-2 py-3 text-muted">No one listed yet.</li>}
      </ul>
      <AddLines kind="crew" pendingNew={pendingNew} ops={ops} />
    </EditorShell>
  );
}

// ---------------------------------------------------------------------
// The frame both lists share: a heading, a hint and column labels
// ---------------------------------------------------------------------
function EditorShell({
  id,
  title,
  hint,
  changed,
  headings,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  changed: boolean;
  headings: [string, string];
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex flex-col gap-1 border-b-2 border-ink pb-2">
        <h2 id={`${id}-h`} className="heading flex flex-wrap items-center gap-2">
          {title} {changed && <span className="tag">Changed</span>}
        </h2>
        <p className="m-0 text-[15px] text-muted">{hint}</p>
      </div>
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-x-4 px-2 text-sm font-bold text-muted md:grid">
        <span>{headings[0]}</span>
        <span>{headings[1]}</span>
        <span />
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------
// Adding: one line at a time, or a whole pasted list
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
  const [mode, setMode] = useState<"none" | "one" | "paste">("none");
  const [role, setRole] = useState("");
  const [person, setPerson] = useState<PersonValue | null>(null);
  const [personTouched, setPersonTouched] = useState(false);
  const [problem, setProblem] = useState("");
  const [paste, setPaste] = useState("");
  const [pasteAdult, setPasteAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const roleWord = kind === "cast" ? "role" : "position";

  const close = () => {
    setMode("none");
    setRole("");
    setPerson(null);
    setPersonTouched(false);
    setProblem("");
    setPaste("");
    setPasteAdult(false);
  };

  function addOne() {
    if (!tidy(role)) return setProblem(kind === "cast" ? "Enter the role." : "Choose the position.");
    // Cast: leaving the person empty adds the role, not cast yet
    if (kind === "cast" && (rolesOnly || (!person && !personTouched))) {
      ops.addRoles([tidy(role)]);
      return close();
    }
    const p = personProblem(person);
    if (p) return setProblem(p);
    ops.addCredit(toCreditAdd(kind, role, person!));
    close();
  }

  // "Role: Person" per line; for the cast, a line with no person adds the role
  async function addPasted() {
    const lines = paste
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        if (rolesOnly) return { role: tidy(l), person: "" };
        const m = l.match(/^(.+?)\s*(?::|\t|\s[-–—]\s)\s*(.+)$/);
        return m ? { role: tidy(m[1]), person: tidy(m[2]) } : { role: tidy(l), person: "" };
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
      return setProblem(`${needsNew.map((l) => l.person).join(", ")} ${needsNew.length === 1 ? "is" : "are"} new to the site. Tick the box to confirm everyone new is 18 or older.`);
    }
    const roles: string[] = [];
    for (const l of resolved) {
      if (!l.person) roles.push(l.role);
      else
        ops.addCredit(
          l.existing
            ? { kind, role: l.role, person_id: l.existing.id, person_label: l.existing.label }
            : { kind, role: l.role, new_name: l.person, adult_confirmed: true },
        );
    }
    if (roles.length) ops.addRoles(roles);
    close();
  }

  if (mode === "one") {
    return (
      <div className="flex max-w-[640px] flex-col gap-3 border border-[#CFCFCF] bg-page p-3">
        <label className="flex flex-col gap-1 text-sm font-bold">
          {kind === "cast" ? "Role" : "Position"}
          {kind === "crew" ? (
            <PositionSelect id={`add-${kind}-role`} value={role} onChange={setRole} className={`${input} max-w-[300px] font-normal`} />
          ) : (
            <input
              list="show-roles"
              value={role}
              maxLength={100}
              placeholder="e.g. Monty Navarro"
              onChange={(e) => setRole(e.target.value)}
              className={`${input} max-w-[300px] font-normal`}
            />
          )}
        </label>
        {!rolesOnly && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`add-${kind}-person`} className="text-sm font-bold">
              Person {kind === "cast" && <span className="font-normal text-muted">(leave empty if it’s not cast yet)</span>}
            </label>
            <PersonPicker
              id={`add-${kind}-person`}
              value={person}
              onChange={(v) => {
                setPerson(v);
                setPersonTouched(!!v);
              }}
              pendingNew={pendingNew}
            />
          </div>
        )}
        {problem && <span className="text-sm font-semibold">{problem}</span>}
        <span className="flex gap-2">
          <button type="button" onClick={addOne} className={small}>
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
          Paste the {kind === "cast" ? "cast" : "creative team"} list, one per line
        </label>
        <span className="text-sm text-muted">
          {rolesOnly ? (
            "One role per line."
          ) : kind === "cast" ? (
            <>
              Like <em>Monty Navarro: Jane Doe</em>. A line with only a role adds the role, not cast yet. Names already on the site
              are matched to their pages.
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
      <button type="button" onClick={() => setMode("one")} className={small}>
        <Icon d={PLUS} /> {kind === "cast" ? "Add a role" : "Add someone to the team"}
      </button>
      <button type="button" onClick={() => setMode("paste")} className={small}>
        <Icon d={PLUS} /> {rolesOnly ? "Paste a list of roles" : "Paste a whole list"}
      </button>
      <span className="sr-only">Each {roleWord} can be changed by clicking it.</span>
    </span>
  );
}
