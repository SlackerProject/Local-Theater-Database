import Link from "next/link";
import { ceremonyHref, ceremonyName, type AwardRow } from "@/lib/awards";
import { SeeAll } from "@/components/SeeAll";

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

export type Status = "won" | "consultant" | "nominated";
export const statusOf = (a: AwardRow): Status => (a.category?.consultant_choice ? "consultant" : a.result === "won" ? "won" : "nominated");
const RANK: Record<Status, number> = { won: 0, consultant: 1, nominated: 2 };
const LABEL: Record<Status, string> = { won: "Winner", consultant: "Consultant Choice", nominated: "Nominee" };
const LABEL_STYLE: Record<Status, string> = {
  won: "font-semibold text-gold-ink",
  consultant: "font-semibold text-ink",
  nominated: "text-muted",
};

// Gold star for a win, a dark diamond for Consultant Choice, an open ring for a nomination
export function ResultMark({ status }: { status: Status }) {
  if (status === "consultant")
    return (
      <svg viewBox="0 0 16 16" aria-hidden className="mt-[3px] size-3.5 shrink-0 fill-ink">
        <path d="M8 1.5l6.5 6.5L8 14.5 1.5 8z" />
      </svg>
    );
  return status === "won" ? (
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

// Grouped by ceremony with its tally. Every line says Winner, Consultant Choice or Nominee
// (symbol and word, never color alone); wins first, then Consultant Choice.
// A person's page shows the show and who they shared it with; a company's
// page (withShow) shows the show and the names. With a limit, the rest wait
// behind "See all".
export function AwardList({ rows, personSlug, withShow = false, limit }: { rows: AwardRow[]; personSlug?: string; withShow?: boolean; limit?: number }) {
  const ceremonies = new Map<string, Line[]>();
  for (const line of groupAwards(rows)) {
    const name = ceremonyName(line.first);
    ceremonies.set(name, [...(ceremonies.get(name) ?? []), line]);
  }
  const blocks = [...ceremonies].map(([ceremony, lines]) => ({
    ceremony,
    slug: lines[0].first.ceremony?.slug ?? null,
    lines: [...lines].sort((a, b) => RANK[statusOf(a.first)] - RANK[statusOf(b.first)]),
  }));
  const total = blocks.reduce((n, b) => n + b.lines.length, 0);
  const cut = limit && total > limit + 1 ? limit : Infinity;
  const extra = "group-data-[collapsed=true]:hidden";
  const hiddenKeys = new Set(blocks.flatMap((b) => b.lines).slice(cut === Infinity ? total : cut).map((l) => l.key));

  const list = (
    <div className="flex flex-col gap-5">
      {blocks.map(({ ceremony, slug, lines }) => {
        const count = (st: Status) => lines.filter((l) => statusOf(l.first) === st).length;
        const wins = count("won");
        const picks = count("consultant");
        const noms = count("nominated");
        const blockHidden = lines.every((l) => hiddenKeys.has(l.key));
        return (
          <div key={ceremony} className={`flex flex-col gap-3 ${blockHidden ? extra : ""}`}>
            <div className="flex flex-col border-b border-rule pb-1.5">
              <h3 className="m-0 text-[15px] font-bold">{slug ? <Link href={ceremonyHref(slug)}>{ceremony}</Link> : ceremony}</h3>
              <span className="text-[13px] text-muted">
                {[wins && plural(wins, "win"), picks && `${picks} Consultant Choice`, noms && plural(noms, "nomination")].filter(Boolean).join(" · ")}
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {lines.map(({ key, first: a, people }) => {
                const hidden = hiddenKeys.has(key);
                const status = statusOf(a);
                const others = personSlug ? people.filter((p) => p.slug !== personSlug) : people;
                const prod = personSlug || withShow ? a.production : null;
                const show = prod ? (prod.title_override ?? prod.show?.title) : null;
                return (
                  <li key={key} className={`flex gap-2 text-[15px] leading-snug ${hidden ? extra : ""}`}>
                    <ResultMark status={status} />
                    <div className="flex min-w-0 flex-col">
                      <AwardName name={a.category?.name ?? "Award"} />
                      <span className="text-[14px]">
                        <span className={LABEL_STYLE[status]}>{LABEL[status]}</span>
                        {prod && show && (
                          <>
                            {" · "}
                            <Link href={`/production/${prod.slug}`}>{show}</Link>
                          </>
                        )}
                        {others.length > 0 && (
                          <>
                            {show && personSlug ? <span className="text-muted"> with </span> : " · "}
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
  return cut === Infinity ? list : <SeeAll total={total}>{list}</SeeAll>;
}
