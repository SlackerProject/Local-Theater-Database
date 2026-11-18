"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  addCeremonyAward,
  addNominee,
  createCeremony,
  createPerson,
  deleteCeremony,
  removeCeremonyAward,
  removeNominee,
  setWinner,
} from "../actions";

export type Category = { id: string; name: string; kind: string; has_nominees: boolean };
export type Nominee = { key: string; categoryId: string; entryIds: string[]; won: boolean; label: string; detail: string; people: string[] };
type Pick = { id: string; label: string; detail: string };
type Credit = { id: string; person: string; role: string };
type Done = { ok: true } | { ok: false; error: string };

const small = "min-h-10 px-4 text-sm";
const field = "field h-11 w-full max-w-[460px] px-3";
const labelText = "text-sm font-semibold";

// Awards grouped by who they go to
const KINDS = [
  { kind: "performer", title: "Performers", label: "A performer" },
  { kind: "youth", title: "Young Performers", label: "A young performer (never named)" },
  { kind: "creative", title: "Creative Team", label: "A creative team member" },
  { kind: "production", title: "Productions", label: "A production" },
  { kind: "company", title: "Companies", label: "A company" },
  { kind: "person", title: "People", label: "A person (not for one show)" },
] as const;

const clean = (q: string) => q.replace(/[%_,()]/g, " ");
// Matching productions by date, most recent first, so this season's are at the top
const findProductions = async (q: string): Promise<Pick[]> => {
  const supabase = createClient();
  const { data } = await supabase.rpc("lookup_productions", { p_query: q, max_results: 20 });
  const hits = data ?? [];
  const { data: dates } = hits.length
    ? await supabase.from("productions").select("id, year, opening_date").in("id", hits.map((h) => h.id))
    : { data: [] };
  const when = new Map((dates ?? []).map((d) => [d.id, d.opening_date ?? `${d.year}-00-00`]));
  return [...hits]
    .sort((a, b) => (when.get(b.id) ?? "").localeCompare(when.get(a.id) ?? ""))
    .map((d) => ({ id: d.id, label: d.label, detail: d.detail }));
};
const findPeople = async (q: string): Promise<Pick[]> => {
  const { data } = await createClient().from("people").select("id, display_name, credits(count)").ilike("display_name", `%${clean(q)}%`).limit(8);
  return (data ?? []).map((d) => ({ id: d.id, label: d.display_name, detail: `${d.credits?.[0]?.count ?? 0} credits` }));
};
const findCompanies = async (q: string): Promise<Pick[]> => {
  const { data } = await createClient().from("organizations").select("id, name, town").ilike("name", `%${clean(q)}%`).limit(8);
  return (data ?? []).map((d) => ({ id: d.id, label: d.name, detail: d.town ?? "" }));
};

// Type-ahead search; people can also be added when they aren't found
function Search({
  label,
  placeholder,
  value,
  onPick,
  find,
  onNew,
}: {
  label: string;
  placeholder: string;
  value: Pick | null;
  onPick: (p: Pick | null) => void;
  find: (q: string) => Promise<Pick[]>;
  onNew?: (name: string) => void;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Pick[]>([]);
  useEffect(() => {
    if (value || q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => find(q.trim()).then((h) => live && setHits(h)), 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, value, find]);

  if (value)
    return (
      <div className="flex flex-col gap-1">
        <span className={labelText}>{label}</span>
        <span className="flex max-w-[460px] items-center gap-2 rounded-md border border-rule px-3 py-2">
          <span className="min-w-0 flex-1">
            <strong>{value.label}</strong> {value.detail && <span className="text-sm text-muted">· {value.detail}</span>}
          </span>
          <button type="button" onClick={() => onPick(null)} className="btn-text text-sm">
            Change
          </button>
        </span>
      </div>
    );

  const typed = q.trim();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelText}>
        {label}
      </label>
      <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={field} autoComplete="off" />
      {typed.length >= 2 && (hits.length > 0 || onNew) && (
        <ul className="m-0 flex max-w-[460px] list-none flex-col rounded-md border border-rule p-0">
          {hits.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(m);
                  setQ("");
                  setHits([]);
                }}
                className="flex w-full cursor-pointer flex-col border-0 border-b border-rule bg-transparent px-3 py-2 text-left hover:bg-soft"
              >
                <span className="font-semibold">{m.label}</span>
                {m.detail && <span className="text-sm text-muted">{m.detail}</span>}
              </button>
            </li>
          ))}
          {onNew && (
            <li>
              <button
                type="button"
                onClick={() => {
                  onNew(typed);
                  setQ("");
                  setHits([]);
                }}
                className="w-full cursor-pointer border-0 bg-transparent px-3 py-2 text-left font-semibold hover:bg-soft"
              >
                + Add “{typed}” as a new person
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// Add a nominee, or the winner of a winner-only award
function AddNominee({ ceremonyId, category, sourceUrl, onAdded }: { ceremonyId: string; category: Category; sourceUrl: string; onAdded: () => void }) {
  const [production, setProduction] = useState<Pick | null>(null);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [person, setPerson] = useState<Pick | null>(null);
  const [newName, setNewName] = useState("");
  const [adult, setAdult] = useState(false);
  const [company, setCompany] = useState<Pick | null>(null);
  // People named on the award who aren't in this production's credits (or on the site)
  const [others, setOthers] = useState<{ id?: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const { kind } = category;
  const namesPeople = kind === "performer" || kind === "creative";

  // The production's adult cast (performers) or creative team
  useEffect(() => {
    if (!production || !namesPeople) return;
    let live = true;
    createClient()
      .from("credits")
      .select("id, kind, role_name, billing_order, person:people(display_name), character:show_characters(name)")
      .eq("production_id", production.id)
      .eq("is_young_performer", false)
      .eq("kind", kind === "performer" ? "cast" : "crew")
      .order("billing_order")
      .then(({ data }) => {
        if (live) setCredits((data ?? []).map((c) => ({ id: c.id, person: c.person?.display_name ?? "?", role: c.character?.name ?? c.role_name ?? "" })));
      });
    return () => {
      live = false;
    };
  }, [production, namesPeople, kind]);

  const newOthers = others.filter((o) => !o.id);
  const ready =
    kind === "company" ? !!company : kind === "person" ? !!person || (!!newName && adult) : !!production && (!newOthers.length || adult);
  const reset = () => {
    setProduction(null);
    setCredits([]);
    setChosen([]);
    setPerson(null);
    setNewName("");
    setAdult(false);
    setCompany(null);
    setOthers([]);
  };

  const submit = () =>
    start(async () => {
      setError("");
      let personId = person?.id;
      if (kind === "person" && !personId) {
        const made = await createPerson(newName, adult);
        if (!made.ok) return setError(made.error);
        personId = made.id;
      }
      // Anyone else named: on the site already, or added now
      const otherIds: string[] = [];
      for (const o of others) {
        if (o.id) otherIds.push(o.id);
        else {
          const made = await createPerson(o.name, adult);
          if (!made.ok) return setError(made.error);
          otherIds.push(made.id);
        }
      }
      const r = await addNominee({
        ceremony_id: ceremonyId,
        category_id: category.id,
        source_url: sourceUrl.trim(),
        won: !category.has_nominees,
        ...(kind === "company"
          ? { organization_id: company!.id }
          : kind === "person"
            ? { person_id: personId }
            : { production_id: production!.id, credit_ids: chosen, person_ids: otherIds }),
      });
      if (!r.ok) return setError(r.error);
      reset();
      onAdded();
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-rule p-4">
      <span className="font-bold">{category.has_nominees ? "Add a nominee" : "Add the winner"}</span>
      {kind === "company" ? (
        <Search label="Company" placeholder="Start typing the company’s name" value={company} onPick={setCompany} find={findCompanies} />
      ) : kind === "person" ? (
        newName ? (
          <div className="flex flex-col gap-2">
            <span className={labelText}>Person</span>
            <span className="flex max-w-[460px] items-center gap-2 rounded-md border border-rule px-3 py-2">
              <span className="min-w-0 flex-1">
                <strong>{newName}</strong> <span className="text-sm text-muted">· new to the site</span>
              </span>
              <button type="button" onClick={() => setNewName("")} className="btn-text text-sm">
                Change
              </button>
            </span>
            <label className="flex cursor-pointer items-center gap-2.5 text-[15px]">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="h-5 w-5 accent-ink" />
              I confirm they’re 18 or older
            </label>
          </div>
        ) : (
          <Search label="Person" placeholder="Start typing their name" value={person} onPick={setPerson} find={findPeople} onNew={setNewName} />
        )
      ) : (
        <Search
          label="Production"
          placeholder="Start typing the show’s title"
          value={production}
          onPick={(p) => {
            setProduction(p);
            setCredits([]);
            setChosen([]);
          }}
          find={findProductions}
        />
      )}
      {production && namesPeople && (
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className={`${labelText} mb-1`}>Who does it name?</legend>
          {credits.map((c) => (
            <label key={c.id} className="flex min-h-10 cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={chosen.includes(c.id)}
                onChange={(e) => setChosen((x) => (e.target.checked ? [...x, c.id] : x.filter((y) => y !== c.id)))}
                className="h-5 w-5 accent-ink"
              />
              <span>
                <strong>{c.person}</strong>
                {c.role && <span className="text-muted"> · {c.role}</span>}
              </span>
            </label>
          ))}
          {others.map((o, i) => (
            <span key={`${o.id ?? o.name}-${i}`} className="flex min-h-10 items-center gap-2.5">
              <strong>{o.name}</strong>
              {!o.id && <span className="text-sm text-muted">· new to the site</span>}
              <button type="button" onClick={() => setOthers((x) => x.filter((_, j) => j !== i))} className="btn-text text-sm">
                Remove
              </button>
            </span>
          ))}
          <Search
            label="Someone else"
            placeholder="Start typing their name"
            value={null}
            onPick={(p) => p && setOthers((x) => (x.some((o) => o.id === p.id) ? x : [...x, { id: p.id, name: p.label }]))}
            find={findPeople}
            onNew={(name) => setOthers((x) => [...x, { name }])}
          />
          {newOthers.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2.5 text-[15px]">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="h-5 w-5 accent-ink" />
              I confirm {newOthers.length === 1 ? "they’re" : "they’re all"} 18 or older
            </label>
          )}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending || !ready} onClick={submit} className={`btn-primary ${small}`}>
          {pending ? "Adding…" : category.has_nominees ? "Add nominee" : "Add winner"}
        </button>
        {error && (
          <span role="alert" className="text-sm font-semibold text-alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

// "Are you sure?" in place, for removing things
function ConfirmRemove({ label, question, onConfirm }: { label: string; question: string; onConfirm: () => Promise<Done> }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!asking)
    return (
      <button type="button" onClick={() => setAsking(true)} className="btn-text self-start text-sm">
        {label}
      </button>
    );
  return (
    <div className="callout flex flex-col gap-2 text-[15px]">
      <span>{question}</span>
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await onConfirm();
              if (!r.ok) setError(r.error);
            })
          }
          className={`btn-primary ${small}`}
        >
          {pending ? "Removing…" : "Remove"}
        </button>
        <button type="button" onClick={() => setAsking(false)} className={`btn-secondary ${small}`}>
          Cancel
        </button>
        {error && <span className="font-semibold text-alert">{error}</span>}
      </span>
    </div>
  );
}

// One award: its nominees (or winners), "Won" boxes, adding, and removing it
function AwardPanel({ ceremony, category, nominees, sourceUrl }: { ceremony: { id: string; label: string }; category: Category; nominees: Nominee[]; sourceUrl: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<Done>) =>
    start(async () => {
      setError("");
      const r = await fn();
      if (r.ok) router.refresh();
      else setError(r.error);
    });

  return (
    <div className="flex flex-col gap-3 pb-4">
      {nominees.length > 0 && (
        <ul className="m-0 flex list-none flex-col border-t border-rule p-0">
          {nominees.map((n) => (
            <li key={n.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule py-2.5">
              {category.has_nominees && (
                <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={n.won}
                    disabled={pending}
                    onChange={(e) => act(() => setWinner(n.entryIds, e.target.checked))}
                    className="h-5 w-5 accent-ink"
                  />
                  Won
                </label>
              )}
              {/* Awards naming people lead with the people; the show comes second */}
              <span className="min-w-0 flex-1">
                <strong>{n.people.length ? n.people.join(" & ") : n.label}</strong>
                {n.people.length ? (
                  <span className="block text-sm text-muted">{[n.label, n.detail].filter(Boolean).join(" · ")}</span>
                ) : (
                  n.detail && <span className="text-muted"> · {n.detail}</span>
                )}
              </span>
              <button type="button" disabled={pending} onClick={() => act(() => removeNominee(n.entryIds))} className="btn-text text-sm">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-alert">
          {error}
        </p>
      )}
      <AddNominee ceremonyId={ceremony.id} category={category} sourceUrl={sourceUrl} onAdded={() => router.refresh()} />
      <ConfirmRemove
        label={`Remove this award from ${ceremony.label}`}
        question={`Remove “${category.name}” from ${ceremony.label}${nominees.length ? `, with its ${nominees.length} ${category.has_nominees ? "nominee" : "winner"}${nominees.length === 1 ? "" : "s"}` : ""}? This can’t be undone.`}
        onConfirm={async () => {
          const r = await removeCeremonyAward(ceremony.id, category.id);
          if (r.ok) router.refresh();
          return r;
        }}
      />
    </div>
  );
}

// Add an award to the ceremony
function AddAward({ ceremonyId }: { ceremonyId: string }) {
  const router = useRouter();
  const ids = { name: useId(), kind: useId() };
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("performer");
  const [hasNominees, setHasNominees] = useState(true);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-rule p-4">
      <h3 className="subheading m-0">Add an Award</h3>
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.name} className={labelText}>
          Award name
        </label>
        <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lead Performer Musical · Comedy" className={field} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.kind} className={labelText}>
          Who does it go to?
        </label>
        <select
          id={ids.kind}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setHasNominees(e.target.value !== "person");
          }}
          className={`${field} max-w-[320px]`}
        >
          {KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className={`${labelText} mb-1`}>How is it given?</legend>
        {[true, false].map((v) => (
          <label key={String(v)} className="flex min-h-10 cursor-pointer items-center gap-2.5">
            <input type="radio" name={`${ids.kind}-nominees`} checked={hasNominees === v} onChange={() => setHasNominees(v)} className="h-5 w-5 accent-ink" />
            {v ? "Nominees, then a winner" : "Just the winner (like a special honor)"}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={() =>
            start(async () => {
              setError("");
              const r = await addCeremonyAward(ceremonyId, name, kind, hasNominees);
              if (!r.ok) return setError(r.error);
              setName("");
              router.refresh();
            })
          }
          className={`btn-primary ${small}`}
        >
          {pending ? "Adding…" : "Add award"}
        </button>
        {error && (
          <span role="alert" className="text-sm font-semibold text-alert">
            {error}
          </span>
        )}
      </div>
    </section>
  );
}

// A new ceremony: its name and season, kept separate
function NewCeremony({ names, onCancel }: { names: string[]; onCancel?: () => void }) {
  const router = useRouter();
  const ids = { name: useId(), season: useId(), src: useId(), list: useId() };
  const [name, setName] = useState(names[0] ?? "");
  const [season, setSeason] = useState("");
  const [source, setSource] = useState("");
  const [copy, setCopy] = useState(true);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const earlier = names.find((n) => n.toLowerCase() === name.trim().toLowerCase());

  return (
    <section className="flex flex-col gap-3 rounded-lg border-2 border-ink p-4">
      <h3 className="subheading m-0">New Ceremony</h3>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <label htmlFor={ids.name} className={labelText}>
            Ceremony
          </label>
          <input id={ids.name} list={ids.list} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. DASH Awards" className={field} />
          <datalist id={ids.list}>
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div className="flex w-[200px] flex-col gap-1">
          <label htmlFor={ids.season} className={labelText}>
            Season
          </label>
          <input id={ids.season} value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2025–2026" className={field} inputMode="numeric" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.src} className={labelText}>
          Source link <span className="font-normal text-muted">(optional: the page announcing it)</span>
        </label>
        <input id={ids.src} type="url" value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://www.emact.org/…" className={field} />
      </div>
      {earlier && (
        <label className="flex cursor-pointer items-center gap-2.5 text-[15px]">
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} className="h-5 w-5 accent-ink" />
          Start with the same awards as the last {earlier}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !name.trim() || !season.trim()}
          onClick={() =>
            start(async () => {
              setError("");
              const r = await createCeremony(name, season, source, copy);
              if (!r.ok) return setError(r.error);
              router.push(`/awards/add?ceremony=${r.id}`);
              onCancel?.();
            })
          }
          className={`btn-primary ${small}`}
        >
          {pending ? "Adding…" : "Add ceremony"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={`btn-secondary ${small}`}>
            Cancel
          </button>
        )}
        {error && (
          <span role="alert" className="text-sm font-semibold text-alert">
            {error}
          </span>
        )}
      </div>
    </section>
  );
}

export function SeasonEditor({
  ceremonies,
  ceremony,
  categories,
  nominees,
}: {
  ceremonies: { id: string; name: string; label: string }[];
  ceremony: { id: string; label: string; sourceUrl: string } | null;
  categories: Category[];
  nominees: Nominee[];
}) {
  const router = useRouter();
  const ids = { cer: useId(), src: useId() };
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [source, setSource] = useState(ceremony?.sourceUrl ?? "");
  const names = [...new Set(ceremonies.map((c) => c.name))];

  if (!ceremony) return <NewCeremony names={names} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.cer} className={labelText}>
            Ceremony
          </label>
          <select id={ids.cer} value={ceremony.id} onChange={(e) => router.push(`/awards/add?ceremony=${e.target.value}`)} className="field h-11 px-3">
            {ceremonies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={`btn-secondary ${small}`}>
            + New ceremony
          </button>
        )}
      </div>
      {adding && <NewCeremony names={names} onCancel={() => setAdding(false)} />}

      <div className="flex flex-col gap-1">
        <label htmlFor={ids.src} className={labelText}>
          Source link
        </label>
        <input id={ids.src} type="url" value={source} onChange={(e) => setSource(e.target.value)} className={field} />
      </div>

      {!categories.length && <p className="m-0 text-muted">This ceremony has no awards yet. Add them below.</p>}
      {KINDS.map(({ kind, title }) => {
        const group = categories.filter((c) => c.kind === kind);
        if (!group.length) return null;
        return (
          <section key={kind} className="flex flex-col">
            <h3 className="subheading mb-1">{title}</h3>
            <ul className="m-0 flex list-none flex-col border-t border-rule p-0">
              {group.map((c) => {
                const mine = nominees.filter((n) => n.categoryId === c.id);
                const winners = mine.filter((n) => n.won);
                const isOpen = open === c.id;
                return (
                  <li key={c.id} className="border-b border-rule">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : c.id)}
                      className="flex min-h-12 w-full cursor-pointer flex-wrap items-center justify-between gap-x-4 border-0 bg-transparent py-2 text-left"
                    >
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-sm text-muted">
                        {!mine.length
                          ? c.has_nominees
                            ? "No nominees yet"
                            : "No winner yet"
                          : !c.has_nominees
                            ? mine.map((w) => w.label).join(", ")
                            : winners.length
                              ? `Won: ${winners.map((w) => (w.people.length ? w.people.join(" & ") : w.label)).join(", ")}`
                              : `${mine.length} nominee${mine.length === 1 ? "" : "s"} · winner not picked`}
                        <span aria-hidden="true"> {isOpen ? "▴" : "▾"}</span>
                      </span>
                    </button>
                    {isOpen && <AwardPanel ceremony={ceremony} category={c} nominees={mine} sourceUrl={source} />}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <AddAward ceremonyId={ceremony.id} />

      <ConfirmRemove
        label={`Remove ${ceremony.label}`}
        question={`Remove ${ceremony.label} and every award entered for it (${nominees.length} so far)? This can’t be undone.`}
        onConfirm={async () => {
          const r = await deleteCeremony(ceremony.id);
          if (r.ok) router.push("/awards/add");
          return r;
        }}
      />
    </div>
  );
}
