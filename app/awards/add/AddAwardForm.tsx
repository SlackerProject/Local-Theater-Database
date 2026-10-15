"use client";

import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { submitAward, type AwardInput } from "../actions";

type Body = { id: string; name: string };
type Category = { id: string; name: string; award_body_id: string };
type Production = { id: string; label: string; detail: string };
type Credit = { id: string; person: string; role: string; kind: string };

const input = "field h-12 w-full max-w-[460px] px-3";
const row = "flex flex-col gap-1.5";
const labelText = "font-bold";

// One award at a time; after saving, the awards, year and category stay so
// a whole category's nominees can be entered quickly
export function AddAwardForm({ bodies, categories, defaultYear, isModerator }: { bodies: Body[]; categories: Category[]; defaultYear: string; isModerator: boolean }) {
  const [bodyId, setBodyId] = useState(bodies[0]?.id ?? "new");
  const [newBody, setNewBody] = useState("");
  const [year, setYear] = useState(defaultYear);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [newCategory, setNewCategory] = useState(false);
  const [prodQuery, setProdQuery] = useState("");
  const [prodMatches, setProdMatches] = useState<Production[]>([]);
  const [production, setProduction] = useState<Production | null>(null);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [creditId, setCreditId] = useState("");
  const [result, setResult] = useState<"nominated" | "won">("nominated");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const ids = { body: useId(), year: useId(), cat: useId(), prod: useId(), note: useId() };

  const bodyCategories = categories.filter((c) => c.award_body_id === bodyId);
  const catMatches = categoryQuery.trim()
    ? bodyCategories.filter((c) => c.name.toLowerCase().includes(categoryQuery.trim().toLowerCase())).slice(0, 8)
    : bodyCategories.slice(0, 8);

  // Production type-ahead
  useEffect(() => {
    if (production || prodQuery.trim().length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc("lookup_productions", { p_query: prodQuery });
      if (live) setProdMatches(data ?? []);
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [prodQuery, production]);

  // The production's cast and crew, for "who is being honored"
  useEffect(() => {
    if (!production) return;
    let live = true;
    createClient()
      .from("credits")
      .select("id, kind, role_name, billing_order, is_young_performer, person:people(display_name), character:show_characters(name)")
      .eq("production_id", production.id)
      .order("kind")
      .order("billing_order")
      .then(({ data }) => {
        if (!live) return;
        setCredits(
          (data ?? []).map((c) => ({ id: c.id, kind: c.kind, person: c.is_young_performer ? "Young performer" : (c.person?.display_name ?? "?"), role: c.character?.name ?? c.role_name ?? "" })),
        );
      });
    return () => {
      live = false;
    };
  }, [production]);

  function submit() {
    setError("");
    const award: AwardInput = {
      ...(bodyId === "new" ? { new_body: newBody.trim() } : { body_id: bodyId }),
      year: year.trim(),
      ...(category && !newCategory ? { category_id: category.id } : { new_category: categoryQuery.trim() }),
      production_id: production?.id ?? "",
      ...(creditId ? { credit_id: creditId } : {}),
      result,
    };
    if (bodyId === "new" && !award.new_body) return setError("Enter the name of the awards.");
    if (!award.category_id && !award.new_category) return setError("Choose or add the category.");
    if (!production) return setError("Choose the production.");
    start(async () => {
      const r = await submitAward(award, note);
      if (!r.ok) return setError(r.error);
      const who = credits.find((c) => c.id === creditId)?.person;
      setSaved((s) => [
        `${result === "won" ? "Won" : "Nominated"}, ${category?.name ?? categoryQuery.trim()}${who ? `: ${who}` : ""}, ${production.label}${r.published ? "" : " (sent for review)"}`,
        ...s,
      ]);
      // Ready for the next nominee in the same category
      setProduction(null);
      setProdQuery("");
      setCredits([]);
      setCreditId("");
      setResult("nominated");
      setNote("");
    });
  }

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
          <Link href={`/awards?year=${year}`} className="font-semibold">
            See the {year} awards
          </Link>
        </div>
      )}

      <div className={row}>
        <label htmlFor={ids.body} className={labelText}>
          Awards
        </label>
        <select id={ids.body} value={bodyId} onChange={(e) => { setBodyId(e.target.value); setCategory(null); }} className={`${input} max-w-[320px]`}>
          {bodies.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          <option value="new">Other awards…</option>
        </select>
        {bodyId === "new" && (
          <input aria-label="Name of the awards" value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="e.g. DASH Awards" className={input} />
        )}
      </div>

      <div className={row}>
        <label htmlFor={ids.year} className={labelText}>
          Year
        </label>
        <input id={ids.year} inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value)} className={`${input} max-w-[140px]`} />
      </div>

      <div className={row}>
        <label htmlFor={ids.cat} className={labelText}>
          Category
        </label>
        {category && !newCategory ? (
          <span>
            <strong>{category.name}</strong>{" "}
            <button type="button" onClick={() => setCategory(null)} className="btn-text ml-2 text-[15px]">
              Change
            </button>
          </span>
        ) : (
          <>
            <input
              id={ids.cat}
              value={categoryQuery}
              onChange={(e) => {
                setCategoryQuery(e.target.value);
                setNewCategory(false);
              }}
              placeholder="e.g. Best Actress in a Musical"
              className={input}
            />
            {!newCategory && catMatches.length > 0 && (
              <ul className="m-0 flex max-w-[460px] list-none flex-col border border-[#CFCFCF] p-0">
                {catMatches.map((c) => (
                  <li key={c.id} className="border-b border-[#CFCFCF] last:border-b-0">
                    <button type="button" onClick={() => setCategory(c)} className="w-full cursor-pointer border-0 bg-page px-3 py-2 text-left font-semibold hover:bg-soft">
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {categoryQuery.trim().length >= 3 &&
              !bodyCategories.some((c) => c.name.toLowerCase() === categoryQuery.trim().toLowerCase()) &&
              (newCategory ? (
                <span className="text-[15px]">
                  “{categoryQuery.trim()}” will be added as a new category.
                </span>
              ) : (
                <button type="button" onClick={() => setNewCategory(true)} className="btn-text self-start text-[15px]">
                  + Add “{categoryQuery.trim()}” as a new category
                </button>
              ))}
          </>
        )}
      </div>

      <div className={row}>
        <label htmlFor={ids.prod} className={labelText}>
          Production
        </label>
        {production ? (
          <span>
            <strong>{production.label}</strong> <span className="text-muted">{production.detail}</span>{" "}
            <button type="button" onClick={() => { setProduction(null); setCredits([]); setCreditId(""); }} className="btn-text ml-2 text-[15px]">
              Change
            </button>
          </span>
        ) : (
          <>
            <input id={ids.prod} value={prodQuery} onChange={(e) => setProdQuery(e.target.value)} placeholder="Start typing the show’s title" className={input} />
            {prodQuery.trim().length >= 2 && prodMatches.length > 0 && (
              <ul className="m-0 flex max-w-[460px] list-none flex-col border border-[#CFCFCF] p-0">
                {prodMatches.map((m) => (
                  <li key={m.id} className="border-b border-[#CFCFCF] last:border-b-0">
                    <button type="button" onClick={() => setProduction(m)} className="flex w-full cursor-pointer flex-col border-0 bg-page px-3 py-2 text-left hover:bg-soft">
                      <span className="font-semibold">{m.label}</span>
                      <span className="text-sm text-muted">{m.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {production && (
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className={`${labelText} mb-1.5`}>
            Who is honored? <span className="font-normal text-muted">(optional)</span>
          </legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
            <input type="radio" name="credit" checked={creditId === ""} onChange={() => setCreditId("")} className="h-5 w-5 accent-ink" />
            The production itself (e.g. Best Musical)
          </label>
          {credits.map((c) => (
            <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-2.5">
              <input type="radio" name="credit" checked={creditId === c.id} onChange={() => setCreditId(c.id)} className="h-5 w-5 accent-ink" />
              <span>
                <strong>{c.person}</strong> — {c.role} <span className="text-sm text-muted">({c.kind === "cast" ? "cast" : "creative team"})</span>
              </span>
            </label>
          ))}
          {credits.length === 0 && <span className="text-sm text-muted">No cast or crew listed for this production yet.</span>}
        </fieldset>
      )}

      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className={`${labelText} mb-1.5`}>Result</legend>
        <div className="flex gap-6">
          {(["nominated", "won"] as const).map((r) => (
            <label key={r} className="flex min-h-11 cursor-pointer items-center gap-2.5">
              <input type="radio" name="result" checked={result === r} onChange={() => setResult(r)} className="h-5 w-5 accent-ink" />
              {r === "won" ? "Won" : "Nominated"}
            </label>
          ))}
        </div>
      </fieldset>

      {!isModerator && (
        <div className={row}>
          <label htmlFor={ids.note} className={labelText}>
            Notes to moderator <span className="font-normal text-muted">(optional: a link to the announcement)</span>
          </label>
          <textarea id={ids.note} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="field w-full max-w-[620px] p-3" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={submit} className="btn-primary">
          {pending ? "Saving…" : isModerator ? "Save award" : "Send for review"}
        </button>
        <span className="text-sm text-muted">{isModerator ? "Moderators’ entries appear right away." : "A moderator checks each entry before it appears."}</span>
      </div>
      {error && (
        <p role="alert" className="callout m-0 font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
