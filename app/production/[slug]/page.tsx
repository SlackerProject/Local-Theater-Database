import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MarqueeBand, SiteFooter, SiteHeader } from "@/components/SiteHeader";

const SHOW_TYPE_LABEL: Record<string, string> = {
  musical: "Musical",
  play: "Play",
  opera: "Opera",
  revue: "Revue",
  other: "Other",
};

export default function ProductionPage({ params }: PageProps<"/production/[slug]">) {
  return (
    <>
      <SiteHeader />
      <MarqueeBand>Production</MarqueeBand>
      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-11 px-4 pb-16 pt-10 sm:px-8">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Production params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function Production({ params }: Pick<PageProps<"/production/[slug]">, "params">) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("productions")
    .select(
      `slug, year, title_override, opening_date, closing_date, description,
       show:shows(title, subtitle, type),
       organization:organizations(name, town),
       location:locations(name, street_address, town, state),
       performances(starts_at, label, is_cancelled),
       credits(id, kind, role_name, billing_order, is_understudy,
               person:people(slug, display_name),
               character:show_characters(name))`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!p || !p.show) notFound();

  const title = `${p.title_override ?? p.show.title} (${p.year})`;
  const credits = (p.credits ?? [])
    .filter((c) => c.person)
    .sort((a, b) => a.billing_order - b.billing_order);
  const cast = credits.filter((c) => c.kind === "cast");
  const crew = credits.filter((c) => c.kind === "crew");
  const performances = [...(p.performances ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const dates =
    p.opening_date && p.closing_date && p.opening_date !== p.closing_date
      ? `${formatDate(p.opening_date)} – ${formatDate(p.closing_date)}`
      : p.opening_date
        ? formatDate(p.opening_date)
        : null;

  return (
    <>
      <section className="flex flex-col gap-2.5">
        <h1 className="m-0 font-serif text-[40px] font-normal leading-[1.02] tracking-[-0.01em] sm:text-[60px]">{title}</h1>
        <p className="m-0 text-muted">
          {[SHOW_TYPE_LABEL[p.show.type], p.show.subtitle].filter(Boolean).join(" · ")}
        </p>
        <p className="m-0 text-lg">
          <span className="font-semibold text-accent">{p.organization?.name}</span>
          {p.location && (
            <span className="text-muted">
              {" "}· {p.location.name}
              {p.location.town && `, ${p.location.town}`}
            </span>
          )}
        </p>
        {dates && <p className="m-0 text-muted">{dates}</p>}
        {p.description && <p className="m-0 max-w-[620px]">{p.description}</p>}
      </section>

      <div className="flex flex-wrap items-start gap-10">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-11">
          <CreditList heading="Cast" empty="No cast listed yet." rows={cast.map((c) => ({ id: c.id, role: c.character?.name ?? c.role_name ?? "", understudy: c.is_understudy, person: c.person! }))} />
          <CreditList heading="Crew" empty="No crew listed yet." rows={crew.map((c) => ({ id: c.id, role: c.role_name ?? "", understudy: false, person: c.person! }))} />
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-[18px]">
          <section className="flex flex-col gap-2 rounded-xl border border-rule bg-surface p-[22px]">
            <h2 className="eyebrow m-0">All performances</h2>
            {performances.length === 0 ? (
              <p className="m-0 text-[15px] text-muted">No performance dates listed yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {performances.map((pf) => (
                  <li key={pf.starts_at} className="flex flex-wrap justify-between gap-x-3 border-b border-rule py-2 text-[15px] last:border-b-0">
                    <span className={pf.is_cancelled ? "text-muted line-through" : ""}>
                      {new Date(pf.starts_at).toLocaleString("en-US", {
                        timeZone: "America/New_York",
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {pf.label && <span className="text-xs font-bold uppercase tracking-[0.08em] text-accent">{pf.label}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function CreditList({
  heading,
  empty,
  rows,
}: {
  heading: string;
  empty: string;
  rows: { id: string; role: string; understudy: boolean; person: { slug: string; display_name: string } }[];
}) {
  return (
    <section className="flex flex-col">
      <h2 className="m-0 border-b-2 border-ink pb-2 font-serif text-[34px] font-normal">{heading}</h2>
      {rows.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-rule py-3.5">
              <Link href={`/person/${r.person.slug}`} className="font-serif text-[22px] text-ink no-underline">
                {r.person.display_name}
              </Link>
              <span className="text-[15px] font-semibold">
                {r.role}
                {r.understudy && <span className="font-normal text-muted"> (understudy)</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
