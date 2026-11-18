import Link from "next/link";
import { ceremonyName, type AwardRow } from "@/lib/awards";

// One line per nomination or win: everyone it names is listed together
type Person = { slug: string | null; name: string };
type Line = { key: string; first: AwardRow; people: Person[] };

export function groupAwards(rows: AwardRow[]): Line[] {
  const lines = new Map<string, Line>();
  for (const a of rows) {
    const key = a.nomination_id;
    const line = lines.get(key) ?? { key, first: a, people: [] };
    if (a.credit?.is_young_performer) line.people.push({ slug: null, name: "Young performer" });
    else if (a.person && !a.person.is_hidden && !line.people.some((p) => p.slug === a.person!.slug)) {
      line.people.push({ slug: a.person.slug, name: a.person.display_name });
    }
    lines.set(key, line);
  }
  return [...lines.values()];
}

// Gold star for a win, an open ring for a nomination
function ResultMark({ won }: { won: boolean }) {
  return won ? (
    <svg viewBox="0 0 16 16" aria-hidden className="mt-[3px] size-3.5 shrink-0 fill-gold">
      <path d="M8 .9l2.2 4.6 5 .7-3.6 3.5.9 5L8 12.3l-4.5 2.4.9-5L.8 6.2l5-.7z" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" aria-hidden className="mt-[3px] size-3.5 shrink-0 fill-none stroke-field" strokeWidth="2">
      <circle cx="8" cy="8" r="5.5" />
    </svg>
  );
}

// "Lead Performer - Musical - Drama": the award, then the rest lighter
function AwardName({ name }: { name: string }) {
  const [main, ...rest] = name.split(" - ");
  return (
    <span className="font-semibold">
      {main}
      {rest.length > 0 && <span className="font-normal text-muted"> · {rest.join(" · ")}</span>}
    </span>
  );
}

function Names({ people }: { people: Person[] }) {
  return (
    <>
      {people.map((p, i) => (
        <span key={`${p.slug ?? p.name}-${i}`}>
          {i > 0 && (i === people.length - 1 ? " & " : ", ")}
          {p.slug ? <Link href={`/person/${p.slug}`}>{p.name}</Link> : p.name}
        </span>
      ))}
    </>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Grouped by ceremony with its tally. Every line says Winner or Nominee
// (symbol and word, never color alone); wins come first.
export function AwardList({ rows, personSlug }: { rows: AwardRow[]; personSlug?: string }) {
  const ceremonies = new Map<string, Line[]>();
  for (const line of groupAwards(rows)) {
    const name = ceremonyName(line.first);
    ceremonies.set(name, [...(ceremonies.get(name) ?? []), line]);
  }

  return (
    <div className="flex flex-col gap-5">
      {[...ceremonies].map(([ceremony, lines]) => {
        const wins = lines.filter((l) => l.first.result === "won").length;
        const noms = lines.length - wins;
        return (
          <div key={ceremony} className="flex flex-col gap-3">
            <div className="flex flex-col border-b border-rule pb-1.5">
              <h3 className="m-0 text-[15px] font-bold">{ceremony}</h3>
              <span className="text-[13px] text-muted">
                {[wins && plural(wins, "win"), noms && plural(noms, "nomination")].filter(Boolean).join(" · ")}
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {[...lines]
                .sort((a, b) => Number(b.first.result === "won") - Number(a.first.result === "won"))
                .map(({ key, first: a, people }) => {
                  const won = a.result === "won";
                  const others = personSlug ? people.filter((p) => p.slug !== personSlug) : people;
                  const prod = personSlug ? a.production : null;
                  const show = prod ? (prod.title_override ?? prod.show?.title) : null;
                  return (
                    <li key={key} className="flex gap-2 text-[15px] leading-snug">
                      <ResultMark won={won} />
                      <div className="flex min-w-0 flex-col">
                        <AwardName name={a.category?.name ?? "Award"} />
                        <span className="text-[14px]">
                          <span className={won ? "font-semibold text-gold-ink" : "text-muted"}>{won ? "Winner" : "Nominee"}</span>
                          {prod && show && (
                            <>
                              {" · "}
                              <Link href={`/production/${prod.slug}`}>{show}</Link>
                            </>
                          )}
                          {others.length > 0 && (
                            <>
                              {show ? <span className="text-muted"> with </span> : " · "}
                              <Names people={others} />
                            </>
                          )}
                        </span>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
