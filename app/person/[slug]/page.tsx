import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { showColors } from "@/lib/palette";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PosterTile } from "@/components/PosterTile";

export default function PersonPage({ params }: PageProps<"/person/[slug]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-12 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Person params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

// Dot color for a credit with no poster palette (from the reference)
const NO_POSTER_DOT = "#BDBDBD";

async function Person({ params }: Pick<PageProps<"/person/[slug]">, "params">) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select(
      `id, slug, display_name, bio, verified_owner_id,
       credits(id, kind, role_name, hidden_on_person_page, added_by_owner,
               character:show_characters(name),
               production:productions(id, slug, year, title_override, opening_date,
                                      color_ground, color_ground_2, color_ink, color_soft, color_accent,
                                      show:shows(title),
                                      organization:organizations(slug, name),
                                      location:locations(slug, name)))`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!person) notFound();

  const [{ data: collaborators }, { data: owner }] = await Promise.all([
    supabase.rpc("frequent_collaborators", { p_person_id: person.id }),
    person.verified_owner_id
      ? supabase.from("profiles").select("display_name").eq("id", person.verified_owner_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Hidden credits and hidden productions don't appear; newest first
  const credits = (person.credits ?? [])
    .filter((c) => !c.hidden_on_person_page && c.production?.show)
    .map((c) => ({
      ...c,
      prod: c.production!,
      title: c.production!.title_override ?? c.production!.show!.title,
      role: c.character?.name ?? c.role_name ?? "",
    }))
    .sort((a, b) => b.prod.year - a.prod.year || (b.prod.opening_date ?? "").localeCompare(a.prod.opening_date ?? ""));

  // On stage: one tile per production, with every role they had in it
  const shelf = new Map<string, { prod: (typeof credits)[number]["prod"]; title: string; roles: string[] }>();
  for (const c of credits) {
    const entry = shelf.get(c.prod.id) ?? { prod: c.prod, title: c.title, roles: [] };
    if (c.role && !entry.roles.includes(c.role)) entry.roles.push(c.role);
    shelf.set(c.prod.id, entry);
  }

  const crewRoles = [...new Set(credits.filter((c) => c.kind === "crew").map((c) => c.role).filter(Boolean))];
  const descriptor = [
    credits.some((c) => c.kind === "cast") && "Actor",
    ...crewRoles.slice(0, 2),
    `${credits.length} ${credits.length === 1 ? "credit" : "credits"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <section className="flex flex-wrap items-end gap-9">
        <div
          aria-hidden="true"
          className="flex aspect-[4/5] w-[140px] flex-none items-center justify-center rounded-md bg-soft text-5xl font-extrabold text-muted md:w-[180px]"
        >
          {person.display_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2.5">
          <h1 className="display text-[40px] md:text-[60px]" style={{ lineHeight: 1 }}>
            {person.display_name}
          </h1>
          <p className="m-0 text-muted">
            {descriptor}
            {person.verified_owner_id && (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1 font-semibold text-ink">
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#141414" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9.5" />
                    <path d="M8 12.3l2.6 2.5L16 9.5" />
                  </svg>
                  Verified
                </span>
              </>
            )}
          </p>
          {person.bio && <p className="m-0 max-w-[620px]">{person.bio}</p>}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="heading">On stage</h2>
        {shelf.size === 0 ? (
          <p className="m-0 text-muted">Productions will appear here as credits are added.</p>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
            {[...shelf.values()].map(({ prod, title, roles }) => (
              <PosterTile
                key={prod.id}
                href={`/production/${prod.slug}`}
                title={title}
                ground={prod.color_ground}
                caption={
                  <>
                    <span className="font-bold">{roles.join(", ")}</span>
                    <span className="text-[13px] text-muted">
                      {title} ({prod.year})
                    </span>
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-start gap-12">
        <section className="min-w-0 flex-[999_1_560px]">
          <h2 className="heading mb-1">Credits</h2>
          {credits.length === 0 ? (
            <p className="m-0 text-muted">Credits will appear here as productions are added.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {credits.map((c) => {
                const colors = showColors(c.prod);
                const org = c.prod.organization;
                const venue = c.prod.location;
                const production = (
                  <Link href={`/production/${c.prod.slug}`} className="font-bold">
                    {c.title} ({c.prod.year})
                  </Link>
                );
                const company = org ? <Link href={`/company/${org.slug}`}>{org.name}</Link> : "an unknown company";
                return (
                  <li key={c.id} className="flex gap-3.5 border-b border-rule py-3.5">
                    <span
                      aria-hidden="true"
                      className="mt-2 h-2.5 w-2.5 flex-none rounded-full"
                      style={{ background: colors.hasPalette ? colors.accent : NO_POSTER_DOT }}
                    />
                    <span className="flex-1">
                      {c.kind === "cast" ? (
                        <>
                          Played <strong>{c.role}</strong> in {company}’s production of {production}
                        </>
                      ) : (
                        <>
                          <strong>{c.role}</strong> for {company}’s production of {production}
                        </>
                      )}
                      {venue && (
                        <>
                          {" "}at <Link href={`/venue/${venue.slug}`}>{venue.name}</Link>
                        </>
                      )}
                      .
                      {c.added_by_owner && (
                        <span className="block text-[13px] text-muted">Added by {owner?.display_name ?? "the performer"}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-7">
          <section className="flex flex-col gap-2">
            <h2 className="subheading">Frequent collaborators</h2>
            {collaborators?.length ? (
              collaborators.map((f) => (
                <Link key={f.person_id} href={`/person/${f.slug}`}>
                  {f.display_name} · {f.shows_together} shows together
                </Link>
              ))
            ) : (
              <p className="m-0 text-[15px] text-muted">People who share two or more productions will appear here.</p>
            )}
          </section>
          <section className="flex flex-col gap-1.5">
            <h2 className="subheading">Awards</h2>
            <p className="m-0 text-[15px] text-muted">None recorded yet.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
