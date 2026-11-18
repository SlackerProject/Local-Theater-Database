"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addNominee, removeNominee, setWinner } from "../actions";

export type Category = { id: string; name: string; section: string | null; kind: string };
export type Nominee = { key: string; categoryId: string; entryIds: string[]; won: boolean; label: string; detail: string; people: string[] };
type Pick = { id: string; label: string; detail: string };
type Credit = { id: string; person: string; role: string };

const small = "min-h-10 px-4 text-sm";
const field = "field h-11 w-full max-w-[460px] px-3";

// What each kind of category asks for
const KIND_HINT: Record<string, string> = {
  production: "Goes to the production. No one is named.",
  ensemble: "Goes to the whole cast. No one is named.",
  youth: "Young performers are never named, so just add the production.",
  person: "Add the production, then tick everyone the nomination names (or no one).",
  honor: "A special honor for a person, with no production.",
};

const findProductions = async (q: string): Promise<Pick[]> => {
  const { data } = await createClient().rpc("lookup_productions", { p_query: q });
  return (data ?? []).map((d) => ({ id: d.id, label: d.label, detail: d.detail }));
};
const findPeople = async (q: string): Promise<Pick[]> => {
  const { data } = await createClient().from("people").select("id, display_name").ilike("display_name", `%${q.replace(/[%_,()]/g, " ")}%`).limit(8);
  return (data ?? []).map((d) => ({ id: d.id, label: d.display_name, detail: "" }));
};

// Type-ahead search for a production or person
function Search({ label, placeholder, value, onPick, find }: { label: string; placeholder: string; value: Pick | null; onPick: (p: Pick | null) => void; find: (q: string) => Promise<Pick[]> }) {
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

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {value ? (
        <span className="flex max-w-[460px] items-center gap-2 rounded-md border border-rule px-3 py-2">
          <span className="min-w-0 flex-1">
            <strong>{value.label}</strong> {value.detail && <span className="text-sm text-muted">· {value.detail}</span>}
          </span>
          <button type="button" onClick={() => onPick(null)} className="btn-text text-sm">
            Change
          </button>
        </span>
      ) : (
        <>
          <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={field} autoComplete="off" />
          {q.trim().length >= 2 && hits.length > 0 && (
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
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// Add one nominee to a category
function AddNominee({ ceremonyId, category, sourceUrl, onAdded }: { ceremonyId: string; category: Category; sourceUrl: string; onAdded: () => void }) {
  const [production, setProduction] = useState<Pick | null>(null);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [person, setPerson] = useState<Pick | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const honor = category.kind === "honor";

  // The production's adult cast and crew
  useEffect(() => {
    if (!production || category.kind !== "person") return;
    let live = true;
    createClient()
      .from("credits")
      .select("id, kind, role_name, billing_order, person:people(display_name), character:show_characters(name)")
      .eq("production_id", production.id)
      .eq("is_young_performer", false)
      .order("kind")
      .order("billing_order")
      .then(({ data }) => {
        if (live) setCredits((data ?? []).map((c) => ({ id: c.id, person: c.person?.display_name ?? "?", role: c.character?.name ?? c.role_name ?? "" })));
      });
    return () => {
      live = false;
    };
  }, [production, category.kind]);

  const ready = honor ? !!person : !!production;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-rule p-4">
      <span className="font-bold">Add a nominee</span>
      {honor ? (
        <Search label="Person" placeholder="Start typing their name" value={person} onPick={setPerson} find={findPeople} />
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
      {production && category.kind === "person" && (
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1 text-sm font-semibold">Who is nominated?</legend>
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
          {credits.length === 0 && <span className="text-sm text-muted">No cast or crew listed for this production yet.</span>}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !ready}
          onClick={() =>
            start(async () => {
              setError("");
              const r = await addNominee({
                ceremony_id: ceremonyId,
                category_id: category.id,
                source_url: sourceUrl.trim(),
                ...(honor
                  ? { person_id: person!.id }
                  : { production_id: production!.id, credit_ids: chosen }),
              });
              if (!r.ok) return setError(r.error);
              setProduction(null);
              setCredits([]);
              setChosen([]);
              setPerson(null);
              onAdded();
            })
          }
          className={`btn-primary ${small}`}
        >
          {pending ? "Adding…" : "Add nominee"}
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

// One category: its nominees, a Won box for each, and "Add a nominee"
function CategoryPanel({ ceremonyId, category, nominees, sourceUrl }: { ceremonyId: string; category: Category; nominees: Nominee[]; sourceUrl: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setError("");
      const r = await fn();
      if (r.ok) router.refresh();
      else setError(r.error);
    });

  return (
    <div className="flex flex-col gap-3 pb-4">
      <p className="m-0 text-[15px] text-muted">{KIND_HINT[category.kind]}</p>
      {nominees.length > 0 && (
        <ul className="m-0 flex list-none flex-col border-t border-rule p-0">
          {nominees.map((n) => (
            <li key={n.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule py-2.5">
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
              <span className="min-w-0 flex-1">
                <strong>{n.label}</strong>
                {n.detail && <span className="text-muted"> · {n.detail}</span>}
                {n.people.length > 0 && <span className="block text-sm">{n.people.join(" & ")}</span>}
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
      <AddNominee ceremonyId={ceremonyId} category={category} sourceUrl={sourceUrl} onAdded={() => router.refresh()} />
    </div>
  );
}

export function SeasonEditor({
  ceremonies,
  ceremony,
  categories,
  nominees,
}: {
  ceremonies: { id: string; label: string }[];
  ceremony: { id: string; label: string; sourceUrl: string };
  categories: Category[];
  nominees: Nominee[];
}) {
  const router = useRouter();
  const ids = { cer: useId(), src: useId() };
  const [open, setOpen] = useState<string | null>(null);
  const [source, setSource] = useState(ceremony.sourceUrl);
  const sections = [...new Set(categories.map((c) => c.section ?? "Other"))];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.cer} className="text-sm font-semibold">
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
        <div className="flex min-w-[260px] flex-1 flex-col gap-1">
          <label htmlFor={ids.src} className="text-sm font-semibold">
            Source link <span className="font-normal text-muted">(the page announcing the nominees or winners)</span>
          </label>
          <input id={ids.src} type="url" value={source} onChange={(e) => setSource(e.target.value)} className={field} />
        </div>
      </div>

      {sections.map((s) => (
        <section key={s} className="flex flex-col">
          <h3 className="subheading mb-1">{s}</h3>
          <ul className="m-0 flex list-none flex-col border-t border-rule p-0">
            {categories
              .filter((c) => (c.section ?? "Other") === s)
              .map((c) => {
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
                          ? "No nominees yet"
                          : winners.length
                            ? `Won: ${winners.map((w) => w.label).join(", ")}`
                            : `${mine.length} nominee${mine.length === 1 ? "" : "s"} · winner not picked`}
                        <span aria-hidden="true"> {isOpen ? "▴" : "▾"}</span>
                      </span>
                    </button>
                    {isOpen && <CategoryPanel ceremonyId={ceremony.id} category={c} nominees={mine} sourceUrl={source} />}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
