"use client";

import { useEffect, useState } from "react";
import { lookup } from "@/app/add/TypeAhead";
import { personNameKey, type Match } from "@/lib/submission";
import { Icon, PLUS, input, small } from "./ui";

// Who a cast or crew line names: someone on the site, or someone new
export type PersonValue =
  | { person_id: string; person_label: string }
  | {
      new_name: string;
      adult_confirmed: boolean;
      // clash: someone with this name is already on the site;
      // distinct: the contributor says this is a different person
      clash: boolean;
      distinct: boolean;
    };

// Why a person can't be added yet, or null
export function personProblem(v: PersonValue | null): string | null {
  if (!v) return "Pick the person from the list, or add them as someone new.";
  if ("person_id" in v) return null;
  if (v.clash && !v.distinct) return `${v.new_name} is already on the site. Pick them from the list, or tick that it’s a different person.`;
  if (!v.adult_confirmed) return "Confirm that this person is 18 or older.";
  return null;
}

// People already being added as new in this correction can be picked again
// (someone with two roles), so they become one person, not two
const PENDING = "pending:";

// Type a name, then pick someone on the site or add them as new. Adding
// someone new whose name is already on the site needs a "different person"
// tick, so the same person doesn't end up with two pages.
export function PersonPicker({
  id,
  value,
  onChange,
  pendingNew,
}: {
  id: string;
  value: PersonValue | null;
  onChange: (v: PersonValue | null) => void;
  pendingNew: string[];
}) {
  const [name, setName] = useState("");
  const [found, setFound] = useState<Match[]>([]);
  const typed = personNameKey(name);
  const pendingMatches: Match[] = pendingNew
    .filter((n) => typed.length >= 2 && personNameKey(n).includes(typed))
    .map((n) => ({ id: `${PENDING}${n}`, slug: "", label: n, detail: "New person, being added in this correction" }));
  const matches = [...pendingMatches, ...found];
  const sameName = found.filter((m) => personNameKey(m.label) === typed);
  const pendingSame = pendingNew.find((n) => personNameKey(n) === typed);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => lookup("people", name).then((m) => live && setFound(m)), 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [name]);

  if (value && "person_id" in value) {
    return (
      <span className="flex min-h-11 flex-wrap items-center gap-2">
        <strong>{value.person_label}</strong>
        <button type="button" onClick={() => onChange(null)} className={small}>
          Change
        </button>
      </span>
    );
  }

  const isNew = !!value && "new_name" in value;

  return (
    <div className="flex flex-col gap-1.5">
      <input
        id={id}
        value={name}
        autoComplete="off"
        onChange={(e) => {
          setName(e.target.value);
          onChange(null);
        }}
        placeholder="Start typing a name"
        className={input}
      />
      {matches.length > 0 && !isNew && (
        <ul className="m-0 flex max-w-[460px] list-none flex-col border border-[#CFCFCF] p-0">
          {matches.map((m) => (
            <li key={m.id} className="border-b border-[#CFCFCF] last:border-b-0">
              <button
                type="button"
                onClick={() =>
                  onChange(
                    m.id.startsWith(PENDING)
                      ? // Same new person as an earlier line: already confirmed 18+
                        { new_name: m.label, adult_confirmed: true, clash: false, distinct: false }
                      : { person_id: m.id, person_label: m.label },
                  )
                }
                className="flex w-full cursor-pointer flex-col border-0 bg-page px-3 py-2 text-left hover:bg-soft"
              >
                <span className="font-semibold">{m.label}</span>
                {m.detail && <span className="text-sm text-muted">{m.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {name.trim().length >= 2 && !pendingSame && !isNew && (
        <button
          type="button"
          onClick={() =>
            onChange({ new_name: name.trim().replace(/\s+/g, " "), adult_confirmed: false, clash: sameName.length > 0, distinct: false })
          }
          className={`${small} self-start`}
        >
          <Icon d={PLUS} /> Not listed? Add “{name.trim()}” as someone new
        </button>
      )}
      {value && "new_name" in value && (
        <div className="flex max-w-[460px] flex-col gap-1.5 text-[15px]">
          <span>
            <strong>{value.new_name}</strong> will be added as someone new.{" "}
            <button type="button" onClick={() => onChange(null)} className="btn-text text-[15px]">
              Undo
            </button>
          </span>
          {value.clash && (
            <label className="callout flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={value.distinct}
                onChange={(e) => onChange({ ...value, distinct: e.target.checked })}
                className="mt-0.5 h-5 w-5 flex-none accent-ink"
              />
              <span>
                <strong>Someone named {value.new_name} is already on the site</strong> ({sameName[0]?.detail || "see the list above"}). If
                it’s them, press Undo and pick them instead. Tick this only if it’s a different person.
              </span>
            </label>
          )}
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={value.adult_confirmed}
              onChange={(e) => onChange({ ...value, adult_confirmed: e.target.checked })}
              className="mt-0.5 h-5 w-5 flex-none accent-ink"
            />
            I confirm this person is 18 or older.
          </label>
        </div>
      )}
    </div>
  );
}
