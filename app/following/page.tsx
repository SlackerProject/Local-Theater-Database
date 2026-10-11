import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { showColors, swatch } from "@/lib/palette";
import { currentTime, localDay, localTime } from "@/lib/calendar";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { RemoveButton } from "./RemoveButton";

export const metadata: Metadata = { title: "Shows & follows · Local Theater Database" };

export default function FollowingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-10 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Shows &amp; follows</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Following />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const row = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule py-3";

function Swatch({ colors }: { colors: Parameters<typeof swatch>[0] }) {
  const s = swatch(colors);
  return <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full border" style={{ background: s.background, borderColor: s.borderColor }} />;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[15px] text-muted">{children}</p>;
}

async function Following() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/following");
  const supabase = await createClient();

  const prod = `id, slug, year, title_override, opening_date, closing_date,
    color_ground, color_ground_2, color_ink, color_soft, color_accent, color_edge,
    show:shows(title), organization:organizations(name)`;
  const [{ data: watch }, { data: auditions }, { data: follows }] = await Promise.all([
    supabase
      .from("watch_list")
      .select(`status, updated_at, performance:performances(starts_at), production:productions(${prod})`)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("audition_follows")
      .select(`production:productions(${prod}, auditions(starts_at))`)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("follows")
      .select("person:people(id, slug, display_name), organization:organizations(id, slug, name, town)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const now = currentTime().toISOString();
  const shows = (watch ?? []).filter((w) => w.production?.show);
  const groups = [
    { status: "going", heading: "Going", empty: "When you choose “I’m going” on a performance, it will appear here." },
    { status: "want_to_see", heading: "Want to see", empty: "Press “Want to see” on a production page to save it here." },
    { status: "seen", heading: "Seen", empty: "Shows you’ve seen will appear here." },
  ] as const;
  const people = (follows ?? []).flatMap((f) => (f.person ? [f.person] : []));
  const companies = (follows ?? []).flatMap((f) => (f.organization ? [f.organization] : []));

  return (
    <>
      <p className="m-0 -mt-6 text-muted">
        Everything you’ve saved or followed. Dates also appear on <Link href="/calendar">your calendar</Link>.
      </p>

      <section className="flex flex-col gap-6">
        <h2 className="heading">Your shows</h2>
        {groups.map((g) => {
          const items = shows.filter((w) => w.status === g.status);
          return (
            <div key={g.status} className="flex flex-col">
              <h3 className="subheading mb-1">{g.heading}</h3>
              {items.length === 0 ? (
                <Empty>{g.empty}</Empty>
              ) : (
                <ul className="m-0 list-none border-t border-rule p-0">
                  {items.map((w) => {
                    const p = w.production!;
                    const title = `${p.title_override ?? p.show!.title} (${p.year})`;
                    return (
                      <li key={p.id} className={row}>
                        <span className="flex min-w-0 items-start gap-2.5">
                          <Swatch colors={showColors(p)} />
                          <span className="flex min-w-0 flex-col">
                            <Link href={`/production/${p.slug}`} className="link-quiet font-bold">
                              {title}
                            </Link>
                            <span className="text-sm text-muted">
                              {g.status === "going" && w.performance
                                ? `${localDay(w.performance.starts_at)} · ${localTime(w.performance.starts_at)} · `
                                : ""}
                              {p.organization?.name}
                            </span>
                          </span>
                        </span>
                        <RemoveButton target={{ kind: "show", productionId: p.id }} label="Remove" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="heading mb-2">Auditions you’re watching</h2>
        {!auditions?.length ? (
          <Empty>On a production that’s still casting, press “Remind me about auditions” and it will appear here.</Empty>
        ) : (
          <ul className="m-0 list-none border-t border-rule p-0">
            {auditions.map((a) => {
              const p = a.production;
              if (!p?.show) return null;
              const next = (p.auditions ?? []).map((x) => x.starts_at).filter((t) => t >= now).sort()[0];
              return (
                <li key={p.id} className={row}>
                  <span className="flex min-w-0 items-start gap-2.5">
                    <Swatch colors={showColors(p)} />
                    <span className="flex min-w-0 flex-col">
                      <Link href={`/production/${p.slug}`} className="link-quiet font-bold">
                        {p.title_override ?? p.show.title} ({p.year})
                      </Link>
                      <span className="text-sm text-muted">
                        {next ? `Next audition ${localDay(next)} · ${localTime(next)}` : p.auditions?.length ? "Auditions have passed" : "Audition dates: TBD"}
                        {p.organization && ` · ${p.organization.name}`}
                      </span>
                    </span>
                  </span>
                  <RemoveButton target={{ kind: "auditions", productionId: p.id }} label="Stop reminding me" />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="heading mb-2">People you follow</h2>
        {people.length === 0 ? (
          <Empty>Follow people from their pages to hear when they’re cast in a show.</Empty>
        ) : (
          <ul className="m-0 list-none border-t border-rule p-0">
            {people.map((p) => (
              <li key={p.id} className={row}>
                <Link href={`/person/${p.slug}`} className="link-quiet font-bold">
                  {p.display_name}
                </Link>
                <RemoveButton target={{ kind: "person", personId: p.id }} label="Unfollow" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="heading mb-2">Companies you follow</h2>
        {companies.length === 0 ? (
          <Empty>Follow companies from their pages to hear when they announce a show or post auditions.</Empty>
        ) : (
          <ul className="m-0 list-none border-t border-rule p-0">
            {companies.map((c) => (
              <li key={c.id} className={row}>
                <span className="flex flex-col">
                  <Link href={`/company/${c.slug}`} className="link-quiet font-bold">
                    {c.name}
                  </Link>
                  {c.town && <span className="text-sm text-muted">{c.town}</span>}
                </span>
                <RemoveButton target={{ kind: "company", organizationId: c.id }} label="Unfollow" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
