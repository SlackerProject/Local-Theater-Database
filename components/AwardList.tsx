import Link from "next/link";
import { ceremonyName, productionTitle, type AwardRow } from "@/lib/awards";

// One line per nomination or win: everyone it names is listed together
type Line = { key: string; first: AwardRow; people: { slug: string | null; name: string }[] };

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

// The award (bold), the ceremony, won or nominated, then the people (italic)
// and, on a person's page, the production
export function AwardList({ rows, showProduction = false }: { rows: AwardRow[]; showProduction?: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
      {groupAwards(rows).map(({ key, first: a, people }) => (
        <li key={key}>
          <strong>{a.category?.name ?? "Award"}</strong>, {ceremonyName(a)} · {a.result === "won" ? "Won" : "Nominated"}
          {people.length > 0 && (
            <>
              {" · "}
              <em>
                {people.map((p, i) => (
                  <span key={`${p.slug ?? p.name}-${i}`}>
                    {i > 0 && (i === people.length - 1 ? " & " : ", ")}
                    {p.slug ? <Link href={`/person/${p.slug}`}>{p.name}</Link> : p.name}
                  </span>
                ))}
              </em>
            </>
          )}
          {showProduction && a.production && (
            <>
              {" · "}
              <Link href={`/production/${a.production.slug}`}>{productionTitle(a)}</Link>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
