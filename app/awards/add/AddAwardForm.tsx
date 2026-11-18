"use client";

import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { submitAward, type AwardInput } from "../actions";

export type Ceremony = { id: string; label: string; source_url: string | null };
export type Category = { id: string; name: string; section: string | null; kind: string };
type Pick = { id: string; label: string; detail: string };
type Credit = { id: string; person: string; role: string };

const input = "field h-12 w-full max-w-[460px] px-3";
const row = "flex flex-col gap-1.5";
const labelText = "font-bold";

// What each kind of category asks for
const KIND_HINT: Record<string, string> = {
  production: "This award goes to the production, so no one is named.",
  ensemble: "This award goes to the whole cast, so no one is named.",
  youth: "Young performers are never named. The award is saved to the production only.",
  person: "Choose everyone the award names, or no one if it went to the production.",
  honor: "A special honor for a person, with no production.",
};

// Type-ahead search for a production, person or company
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
    <div className={row}>
      <label htmlFor={id} className={labelText}>
        {label}
      </label>
      {value ? (
        <span>
          <strong>{value.label}</strong> <span className="text-muted">{value.detail}</span>{" "}
          <button type="button" onClick={() => onPick(null)} className="btn-text ml-2 text-[15px]">
            Change
          </button>
        </span>
      ) : (
        <>
          <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={input} autoComplete="off" />
          {q.trim().length >= 2 && hits.length > 0 && (
            <ul className="m-0 flex max-w-[460px] list-none flex-col border border-[#CFCFCF] p-0">
              {hits.map((m) => (
                <li key={m.id} className="border-b border-[#CFCFCF] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      onPick(m);
                      setQ("");
                      setHits([]);
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
        </>
      )}
    </div>
  );
}

const findProductions = async (q: string): Promise<Pick[]> => {
  const { data } = await createClient().rpc("lookup_productions", { p_query: q });
  return (data ?? []).map((d) => ({ id: d.id, label: d.label, detail: d.detail }));
};
const findPeople = async (q: string): Promise<Pick[]> => {
  const { data } = await createClient().from("people").select("id, display_name").ilike("display_name", `%${q.replace(/[%_,()]/g, " ")}%`).limit(8);
  return (data ?? []).map((d) => ({ id: d.id, label: d.display_name, detail: "" }));
};
const findCompanies = async (q: string): Promise<Pick[]> => {
  const { data } = await createClient().from("organizations").select("id, name, town").ilike("name", `%${q.replace(/[%_,()]/g, " ")}%`).limit(8);
  return (data ?? []).map((d) => ({ id: d.id, label: d.name, detail: d.town ?? "" }));
};

// One award at a time. The ceremony, category, result and source link stay
// filled in, so a whole category can be entered one after another.
export function AddAwardForm({ ceremonies, categories }: { ceremonies: Ceremony[]; categories: Category[] }) {
  const [ceremonyId, setCeremonyId] = useState(ceremonies[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [production, setProduction] = useState<Pick | null>(null);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [person, setPerson] = useState<Pick | null>(null);
  const [company, setCompany] = useState<Pick | null>(null);
  const [result, setResult] = useState<"nominated" | "won">("won");
  const [source, setSource] = useState(ceremonies[0]?.source_url ?? "");
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const ids = { cer: useId(), cat: useId(), src: useId() };

  const category = categories.find((c) => c.id === categoryId) ?? null;
  const kind = category?.kind ?? "person";
  const sections = [...new Set(categories.map((c) => c.section ?? "Other"))];

  // The production's adult cast and crew, for "who won"
  useEffect(() => {
    if (!production || kind !== "person") return;
    let live = true;
    createClient()
      .from("credits")
      .select("id, kind, role_name, billing_order, is_young_performer, person:people(display_name), character:show_characters(name)")
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
  }, [production, kind]);

  function reset() {
    setProduction(null);
    setCredits([]);
    setChosen([]);
    setPerson(null);
    setCompany(null);
  }

  function submit() {
    setError("");
    if (!ceremonyId) return setError("Choose the ceremony.");
    if (!category) return setError("Choose the category.");
    if (kind === "honor" && !person) return setError("Choose who received this honor.");
    if (kind !== "honor" && !production) return setError("Choose the production.");
    if (!/^https?:\/\/\S+\.\S+/.test(source.trim())) return setError("Add the link to the page that announced this award.");

    const base: AwardInput = { ceremony_id: ceremonyId, category_id: category.id, result, source_url: source.trim() };
    const awards: AwardInput[] =
      kind === "honor"
        ? [{ ...base, person_id: person!.id, ...(company && { organization_id: company.id }) }]
        : kind === "person" && chosen.length
          ? chosen.map((credit_id) => ({ ...base, production_id: production!.id, credit_id }))
          : [{ ...base, production_id: production!.id }];

    start(async () => {
      for (const a of awards) {
        const r = await submitAward(a);
        if (!r.ok) return setError(r.error);
      }
      const who =
        kind === "honor"
          ? person!.label
          : [chosen.map((id) => credits.find((c) => c.id === id)?.person).filter(Boolean).join(" & "), production!.label].filter(Boolean).join(", ");
      setSaved((s) => [`${result === "won" ? "Won" : "Nominated"}, ${category.name}: ${who}`, ...s]);
      reset();
    });
  }

  if (!ceremonies.length) return <p className="m-0 text-muted">No ceremonies yet.</p>;

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      {saved.length > 0 && (
        <div role="status" className="callout flex flex-col gap-1">
          <strong>Saved</strong>
          <ul className="m-0 pl-5 text-[15px]">
            {saved.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <Link href="/awards" className="font-semibold">
            See the awards
          </Link>
        </div>
      )}

      <div className={row}>
        <label htmlFor={ids.cer} className={labelText}>
          Ceremony
        </label>
        <select
          id={ids.cer}
          value={ceremonyId}
          onChange={(e) => {
            setCeremonyId(e.target.value);
            const c = ceremonies.find((x) => x.id === e.target.value);
            if (c?.source_url) setSource(c.source_url);
          }}
          className={`${input} max-w-[320px]`}
        >
          {ceremonies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className={row}>
        <label htmlFor={ids.cat} className={labelText}>
          Category
        </label>
        <select
          id={ids.cat}
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            reset();
          }}
          className={input}
        >
          <option value="">Choose a category</option>
          {sections.map((s) => (
            <optgroup key={s} label={s}>
              {categories
                .filter((c) => (c.section ?? "Other") === s)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {category && <span className="text-[15px] text-muted">{KIND_HINT[kind]}</span>}
      </div>

      {category && kind === "honor" && (
        <>
          <Search label="Who received it?" placeholder="Start typing their name" value={person} onPick={setPerson} find={findPeople} />
          <Search label="Presented by (optional)" placeholder="Start typing the company’s name" value={company} onPick={setCompany} find={findCompanies} />
        </>
      )}

      {category && kind !== "honor" && (
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

      {production && kind === "person" && (
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className={`${labelText} mb-1.5`}>
            Who won? <span className="font-normal text-muted">(choose everyone the award names)</span>
          </legend>
          {credits.map((c) => (
            <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-2.5">
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
          {credits.length === 0 && <span className="text-sm text-muted">No cast or crew listed for this production yet. Add them on the production page first.</span>}
        </fieldset>
      )}

      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className={`${labelText} mb-1.5`}>Result</legend>
        <div className="flex gap-6">
          {(["won", "nominated"] as const).map((r) => (
            <label key={r} className="flex min-h-11 cursor-pointer items-center gap-2.5">
              <input type="radio" name="result" checked={result === r} onChange={() => setResult(r)} className="h-5 w-5 accent-ink" />
              {r === "won" ? "Won" : "Nominated"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className={row}>
        <label htmlFor={ids.src} className={labelText}>
          Source link
        </label>
        <input id={ids.src} type="url" value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://www.emact.org/…" className={input} />
        <span className="text-[15px] text-muted">The page that announced this award.</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={submit} className="btn-primary">
          {pending ? "Saving…" : "Save award"}
        </button>
      </div>
      {error && (
        <p role="alert" className="callout m-0 font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
