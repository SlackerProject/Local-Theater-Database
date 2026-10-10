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

export default function PersonPage({ params }: PageProps<"/person/[slug]">) {
  return (
    <>
      <SiteHeader />
      <MarqueeBand>Person</MarqueeBand>
      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-11 px-4 pb-16 pt-10 sm:px-8">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Person params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Person({ params }: Pick<PageProps<"/person/[slug]">, "params">) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select(
      `id, slug, display_name, bio, verified_owner_id,
       credits(id, kind, role_name, hidden_on_person_page,
               character:show_characters(name),
               production:productions(slug, year, title_override, opening_date,
                                      show:shows(title, type),
                                      organization:organizations(name)))`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!person) notFound();

  const { data: collaborators } = await supabase.rpc("frequent_collaborators", { p_person_id: person.id });

  const credits = (person.credits ?? [])
    .filter((c) => !c.hidden_on_person_page && c.production?.show)
    .sort(
      (a, b) =>
        b.production!.year - a.production!.year ||
        (b.production!.opening_date ?? "").localeCompare(a.production!.opening_date ?? ""),
    );

  const crewRoles = [...new Set(credits.filter((c) => c.kind === "crew").map((c) => c.role_name).filter(Boolean))];
  const descriptor = [
    credits.some((c) => c.kind === "cast") && "Actor",
    ...crewRoles.slice(0, 2),
    `${credits.length} ${credits.length === 1 ? "credit" : "credits"}`,
    person.verified_owner_id ? "Verified" : "Page not yet claimed",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <section className="flex flex-wrap items-end gap-9">
        <div className="flex aspect-[4/5] w-[160px] flex-none items-center justify-center rounded-[14px] bg-chip p-3 text-center text-[13px] text-muted sm:w-[200px]">
          No headshot yet
        </div>
        <div className="flex min-w-0 flex-[999_1_360px] flex-col gap-2.5">
          <h1 className="m-0 font-serif text-[44px] font-normal leading-[1.02] tracking-[-0.01em] sm:text-[60px]">
            {person.display_name}
          </h1>
          <p className="m-0 text-muted">{descriptor}</p>
          <p className={`m-0 max-w-[620px] ${person.bio ? "" : "text-muted"}`}>{person.bio || "No bio yet."}</p>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-10">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col">
          <h2 className="m-0 border-b-2 border-ink pb-2 font-serif text-[34px] font-normal">Stage credits</h2>
          {credits.length === 0 && <p className="text-muted">No credits listed yet.</p>}
          <ul className="m-0 list-none p-0">
            {credits.map((c) => {
              const prod = c.production!;
              return (
                <li key={c.id} className="flex flex-col gap-0.5 border-b border-rule py-3.5">
                  <Link href={`/production/${prod.slug}`} className="font-serif text-[22px] text-ink no-underline">
                    {prod.title_override ?? prod.show!.title} ({prod.year})
                  </Link>
                  <span className="text-[15px]">
                    <strong>{c.character?.name ?? c.role_name}</strong>{" "}
                    <span className="text-muted">
                      · <span className="text-accent">{prod.organization?.name}</span> · {SHOW_TYPE_LABEL[prod.show!.type]}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-[18px]">
          <section className="flex flex-col gap-2 rounded-xl border border-rule bg-surface p-[22px]">
            <h2 className="eyebrow m-0">Awards</h2>
            <p className="m-0 text-[15px] text-muted">
              No awards recorded yet. EMACT nominations and wins will appear here.
            </p>
          </section>
          <section className="flex flex-col gap-2.5 rounded-xl border border-rule bg-surface p-[22px]">
            <h2 className="eyebrow m-0">Frequent collaborators</h2>
            {collaborators?.length ? (
              collaborators.map((f) => (
                <Link key={f.person_id} href={`/person/${f.slug}`} className="font-semibold text-accent no-underline">
                  {f.display_name} · {f.shows_together} shows together
                </Link>
              ))
            ) : (
              <p className="m-0 text-[15px] text-muted">People who share two or more productions will appear here.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
