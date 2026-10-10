import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { showColors } from "@/lib/palette";
import { SHOW_TYPES } from "@/lib/submission";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PosterTile } from "@/components/PosterTile";
import { AllPerformances } from "./AllPerformances";

export default function ProductionPage({ params }: PageProps<"/production/[slug]">) {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<p className="mx-auto w-full max-w-[1180px] px-4 py-12 text-muted md:px-8">Loading…</p>}>
        <Production params={params} />
      </Suspense>
      <SiteFooter />
    </>
  );
}

function formatDate(date: string, withYear = true) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear && { year: "numeric" }),
    timeZone: "UTC",
  });
}

function dateRange(opening: string | null, closing: string | null) {
  if (opening && closing && opening !== closing) {
    const sameYear = opening.slice(0, 4) === closing.slice(0, 4);
    return `${formatDate(opening, !sameYear)} – ${formatDate(closing)}`;
  }
  return opening ? formatDate(opening) : closing ? formatDate(closing) : null;
}

async function Production({ params }: Pick<PageProps<"/production/[slug]">, "params">) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("productions")
    .select(
      `id, slug, year, title_override, opening_date, closing_date, description,
       color_ground, color_ground_2, color_ink, color_soft, color_accent,
       show:shows(id, slug, title, subtitle, type, authors),
       organization:organizations(slug, name),
       location:locations(slug, name, town),
       performances(starts_at, label, is_cancelled),
       credits(id, kind, role_name, billing_order, is_understudy,
               person:people(slug, display_name),
               character:show_characters(name))`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!p || !p.show) notFound();

  const { data: others } = await supabase
    .from("productions")
    .select("id, slug, year, color_ground, organization:organizations(name)")
    .eq("show_id", p.show.id)
    .neq("id", p.id)
    .order("year", { ascending: false })
    .limit(8);

  const c = showColors(p);
  const title = p.title_override ?? p.show.title;
  const credits = (p.credits ?? []).filter((x) => x.person).sort((a, b) => a.billing_order - b.billing_order);
  const cast = credits.filter((x) => x.kind === "cast");
  const crew = credits.filter((x) => x.kind === "crew");
  const typeLabel = SHOW_TYPES.find((t) => t.value === p.show!.type)?.label;
  const about = [p.show.subtitle ?? typeLabel, p.show.authors].filter(Boolean).join(" · ");
  const dates = dateRange(p.opening_date, p.closing_date);
  const performances = [...(p.performances ?? [])]
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((pf) => ({
      when: new Date(pf.starts_at).toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      label: pf.label,
      cancelled: pf.is_cancelled,
    }));

  // Section heading rule takes the show's accent (ink when there's no poster)
  const sectionRule = { borderBottom: `2px solid ${c.accent}` };

  return (
    <>
      {/* Hero: the poster supplies the color */}
      <section
        style={{ background: `linear-gradient(180deg, ${c.ground} 0%, ${c.ground2} 100%)`, color: c.ink }}
        className={c.hasPalette ? "" : "border-b border-rule"}
      >
        <div className="mx-auto flex max-w-[1180px] flex-col items-start gap-[22px] px-4 pb-7 pt-6 md:flex-row md:items-end md:gap-12 md:px-8 md:py-12">
          <div className="w-[190px] flex-none md:w-[270px]">
            <PosterTile title={title} ground={c.hasPalette ? c.ground : null} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {p.organization && (
              <Link href={`/company/${p.organization.slug}`} className="self-start font-semibold underline" style={{ color: c.ink }}>
                {p.organization.name}
              </Link>
            )}
            <h1 className="display text-[42px] md:text-[72px]">
              {title} <span className="font-normal" style={{ color: c.accent }}>({p.year})</span>
            </h1>
            {about && (
              <p className="m-0 text-[17px]" style={{ color: c.soft }}>
                {about}
              </p>
            )}
            {(dates || p.location) && (
              <p className="m-0 text-[17px]" style={{ color: c.soft }}>
                {dates}
                {dates && p.location && " · "}
                {p.location && (
                  <Link href={`/venue/${p.location.slug}`} style={{ color: c.ink }}>
                    {p.location.name}
                  </Link>
                )}
              </p>
            )}
            {p.description && <p className="m-0 max-w-[620px]">{p.description}</p>}
            <AllPerformances performances={performances} ink={c.ink} ground={c.ground} />
          </div>
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-wrap items-start gap-12 px-4 pb-16 pt-7 md:px-8 md:pt-11">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
          <section className="flex flex-col gap-2">
            <h2 className="heading">Photos</h2>
            <p className="m-0 text-muted">Production photos will appear here once members add them.</p>
          </section>

          <section className="flex flex-col">
            <div className="pb-1.5" style={sectionRule}>
              <h2 className="heading">Cast</h2>
            </div>
            {cast.length === 0 ? (
              <p className="m-0 pt-3 text-muted">The cast will appear here once it’s added.</p>
            ) : (
              <ul className="m-0 grid list-none grid-cols-1 gap-x-10 p-0 md:grid-cols-2">
                {cast.map((x) => (
                  <li key={x.id}>
                    <Link
                      href={`/person/${x.person!.slug}`}
                      className="link-quiet flex items-center gap-3 border-b border-rule py-2.5"
                    >
                      <span aria-hidden="true" className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-soft font-bold text-muted">
                        {x.person!.display_name.charAt(0).toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="font-bold">{x.person!.display_name}</span>
                        <span className="text-sm text-muted">
                          {x.character?.name ?? x.role_name}
                          {x.is_understudy && " (understudy)"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col">
            <div className="pb-1.5" style={sectionRule}>
              <h2 className="heading">Creative team</h2>
            </div>
            {crew.length === 0 ? (
              <p className="m-0 pt-3 text-muted">The creative team will appear here once it’s added.</p>
            ) : (
              crew.map((x) => (
                <div key={x.id} className="flex justify-between gap-4 border-b border-rule py-3">
                  <span className="text-muted">{x.role_name}</span>
                  <Link href={`/person/${x.person!.slug}`} className="text-right font-bold">
                    {x.person!.display_name}
                  </Link>
                </div>
              ))
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="subheading">
              Other productions of <Link href={`/show/${p.show.slug}`}>{p.show.title}</Link>
            </h2>
            {others?.length ? (
              <div className="grid grid-cols-2 gap-3.5">
                {others.map((o) => (
                  <PosterTile
                    key={o.id}
                    href={`/production/${o.slug}`}
                    title={p.show!.title}
                    ground={o.color_ground}
                    caption={
                      <span className="text-[13px]">
                        <strong>{o.year}</strong> · {o.organization?.name}
                      </span>
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="m-0 text-[15px] text-muted">Other productions of this show will appear here as they’re added.</p>
            )}
          </section>
          <section className="flex flex-col gap-1.5">
            <h2 className="subheading">Awards</h2>
            <p className="m-0 text-[15px] text-muted">None recorded yet. EMACT nominations and wins will appear here.</p>
          </section>
        </aside>
      </main>
    </>
  );
}
