import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ModerationNav } from "@/app/moderate/ModerationNav";
import { SeasonEditor, type Nominee } from "./SeasonEditor";

export const metadata: Metadata = { title: "Awards · Moderation" };

export default function AddAwardsPage({ searchParams }: PageProps<"/awards/add">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Moderation</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Season searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

type EntryRow = {
  id: string;
  category_id: string;
  result: "nominated" | "won";
  production: { id: string; year: number; title_override: string | null; show: { title: string } | null; organization: { name: string } | null } | null;
  person: { id: string; display_name: string } | null;
  credit: { is_young_performer: boolean } | null;
};

// A season's awards, category by category: add the nominees, then pick the winners
async function Season({ searchParams }: Pick<PageProps<"/awards/add">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/awards/add");
  if (!hasRole(user, "moderator")) {
    return (
      <p className="m-0">
        Awards are entered by moderators for now. Spotted a missing award? Use <strong>Feedback</strong> to let us know, with a
        link to where it was announced. <Link href="/awards">Back to the awards</Link>
      </p>
    );
  }

  const supabase = await createClient();
  const [{ ceremony: wanted }, { data: ceremonies }, { data: categories }] = await Promise.all([
    searchParams,
    supabase.from("award_ceremonies").select("id, name, season, source_url").order("year", { ascending: false }),
    supabase.from("award_categories").select("id, name, section, kind, sort_order").order("sort_order").order("name"),
  ]);
  const ceremony = (ceremonies ?? []).find((c) => c.id === wanted) ?? ceremonies?.[0];

  const { data } = ceremony
    ? await supabase
        .from("award_entries")
        .select(
          `id, category_id, result,
           production:productions(id, year, title_override, show:shows(title), organization:organizations(name)),
           person:people(id, display_name), credit:credits(is_young_performer)`,
        )
        .eq("ceremony_id", ceremony.id)
    : { data: [] };

  // One nominee = one production (or, for honors, one person), with everyone it names
  const nominees = new Map<string, Nominee>();
  for (const e of (data ?? []) as unknown as EntryRow[]) {
    const key = `${e.category_id}:${e.production?.id ?? `person:${e.person?.id}`}`;
    const n = nominees.get(key) ?? {
      key,
      categoryId: e.category_id,
      entryIds: [],
      won: false,
      label: e.production
        ? `${e.production.title_override ?? e.production.show?.title} (${e.production.year})`
        : (e.person?.display_name ?? "?"),
      detail: e.production?.organization?.name ?? "",
      people: [],
    };
    n.entryIds.push(e.id);
    if (e.result === "won") n.won = true;
    if (e.production && e.person) n.people.push(e.person.display_name);
    else if (e.production && e.credit?.is_young_performer) n.people.push("Young performer");
    nominees.set(key, n);
  }

  return (
    <>
      <ModerationNav current="/awards/add" />
      <div className="flex flex-col gap-2">
        <h2 className="heading">Awards</h2>
        <p className="m-0 max-w-[720px] italic text-muted">
          Open a category, add every nominee, then tick the winner once it’s announced. Everything saves as you go.{" "}
          <Link href="/awards">See all awards</Link>
        </p>
      </div>
      {ceremony ? (
        <SeasonEditor
          ceremonies={(ceremonies ?? []).map((c) => ({ id: c.id, label: `${c.name} ${c.season}` }))}
          ceremony={{ id: ceremony.id, label: `${ceremony.name} ${ceremony.season}`, sourceUrl: ceremony.source_url ?? "" }}
          categories={categories ?? []}
          nominees={[...nominees.values()]}
        />
      ) : (
        <p className="m-0 text-muted">No ceremonies yet.</p>
      )}
    </>
  );
}
