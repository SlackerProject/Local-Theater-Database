import { PosterTile } from "./PosterTile";

export type ProductionTile = {
  id: string;
  slug: string;
  year: number;
  title: string;
  ground: string | null;
  posterUrl?: string | null;
  caption: string; // second caption line, e.g. the company
};

// Productions grouped by year: the year as a section heading, newest first,
// with a poster-tile grid beneath (company and venue pages)
export function ProductionsByYear({ productions, empty }: { productions: ProductionTile[]; empty: string }) {
  if (!productions.length) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="heading">Productions</h2>
        <p className="m-0 text-muted">{empty}</p>
      </section>
    );
  }
  const years = [...new Set(productions.map((p) => p.year))].sort((a, b) => b - a);
  return (
    <>
      {years.map((year) => (
        <section key={year} className="flex flex-col gap-4">
          <h2 className="heading border-b border-rule pb-2">{year}</h2>
          <TileGrid productions={productions.filter((p) => p.year === year)} />
        </section>
      ))}
    </>
  );
}

export function TileGrid({ productions }: { productions: ProductionTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
      {productions.map((p) => (
        <PosterTile
          key={p.id}
          href={`/production/${p.slug}`}
          title={p.title}
          ground={p.ground}
          posterUrl={p.posterUrl}
          caption={
            <>
              <span className="font-bold">
                {p.title} ({p.year})
              </span>
              <span className="text-[13px] text-muted">{p.caption}</span>
            </>
          }
        />
      ))}
    </div>
  );
}
