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

// "Lead Performer - Musical - Drama": the award in bold, the rest lighter
function AwardName({ name }: { name: string }) {
  const [main, ...rest] = name.split(" - ");
  return (
    <span className="text-[15px]">
      <strong>{main}</strong>
      {rest.length > 0 && <span className="text-muted"> · {rest.join(" · ")}</span>}
    </span>
  );
}

function Names({ people }: { people: Person[] }) {
  return (
    <em>
      {people.map((p, i) => (
        <span key={`${p.slug ?? p.name}-${i}`}>
          {i > 0 && (i === people.length - 1 ? " & " : ", ")}
          {p.slug ? <Link href={`/person/${p.slug}`}>{p.name}</Link> : p.name}
        </span>
      ))}
    </em>
  );
}

// Grouped by ceremony. Each nomination: the award, then the names (or, on a
// person's page, the show and anyone they shared it with). Wins first.
export function AwardList({ rows, personSlug }: { rows: AwardRow[]; personSlug?: string }) {
  const ceremonies = new Map<string, Line[]>();
  for (const line of groupAwards(rows)) {
    const name = ceremonyName(line.first);
    ceremonies.set(name, [...(ceremonies.get(name) ?? []), line]);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...ceremonies].map(([ceremony, lines]) => (
        <div key={ceremony} className="flex flex-col gap-2.5">
          <h3 className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">{ceremony}</h3>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {[...lines]
              .sort((a, b) => Number(b.first.result === "won") - Number(a.first.result === "won"))
              .map(({ key, first: a, people }) => {
                const others = personSlug ? people.filter((p) => p.slug !== personSlug) : people;
                const prod = personSlug ? a.production : null;
                const show = prod ? (prod.title_override ?? prod.show?.title) : null;
                return (
                  <li key={key} className="flex flex-col leading-snug">
                    <div className="flex items-baseline justify-between gap-3">
                      <AwardName name={a.category?.name ?? "Award"} />
                      {a.result === "won" && (
                        <span className="shrink-0 rounded bg-ink px-1.5 py-px text-[11px] font-bold uppercase tracking-wide text-white">
                          Won
                        </span>
                      )}
                    </div>
                    {(show || others.length > 0) && (
                      <div className="text-[14px] text-muted">
                        {prod && show && <Link href={`/production/${prod.slug}`}>{show}</Link>}
                        {show && others.length > 0 && " with "}
                        {others.length > 0 && <Names people={others} />}
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
