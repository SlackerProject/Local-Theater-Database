import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ModerationNav } from "@/app/moderate/ModerationNav";
import { SeasonEditor, type Category, type Nominee } from "./SeasonEditor";

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
  organization: { id: string; name: string } | null;
};

// A ceremony's awards, one by one: add the nominees (or just the winner),
// then pick the winners
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
  const [{ ceremony: wanted }, { data: ceremonies }] = await Promise.all([
    searchParams,
    supabase.from("award_ceremonies").select("id, name, season, source_url").order("year", { ascending: false }).order("name"),
  ]);
  const ceremony = (ceremonies ?? []).find((c) => c.id === wanted) ?? ceremonies?.[0];

  const [{ data: links }, { data }] = ceremony
    ? await Promise.all([
        supabase
          .from("award_ceremony_categories")
          .select("sort_order, category:award_categories(id, name, kind, has_nominees)")
          .eq("ceremony_id", ceremony.id)
          .order("sort_order"),
        supabase
          .from("award_entries")
          .select(
            `id, category_id, result,
             production:productions(id, year, title_override, show:shows(title), organization:organizations(name)),
             person:people(id, display_name), credit:credits(is_young_performer), organization:organizations(id, name)`,
          )
          .eq("ceremony_id", ceremony.id),
      ])
    : [{ data: [] }, { data: [] }];
  const categories: Category[] = (links ?? []).flatMap((l) => (l.category ? [l.category] : []));

  // One nominee = one production with everyone it names, or one company, or one person
  const nominees = new Map<string, Nominee>();
  for (const e of (data ?? []) as unknown as EntryRow[]) {
    const who = e.production?.id ?? (e.organization ? `org:${e.organization.id}` : `person:${e.person?.id}`);
    const key = `${e.category_id}:${who}`;
    const n = nominees.get(key) ?? {
      key,
      categoryId: e.category_id,
      entryIds: [],
      won: false,
      label: e.production
        ? `${e.production.title_override ?? e.production.show?.title} (${e.production.year})`
        : (e.organization?.name ?? e.person?.display_name ?? "?"),
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
          Choose a ceremony, open an award, and add the nominees. Tick the winner once it’s announced. Everything saves as you go.{" "}
          <Link href="/awards">See all awards</Link>
        </p>
      </div>
      <SeasonEditor
        ceremonies={(ceremonies ?? []).map((c) => ({ id: c.id, name: c.name, label: `${c.name} ${c.season}` }))}
        ceremony={ceremony ? { id: ceremony.id, label: `${ceremony.name} ${ceremony.season}`, sourceUrl: ceremony.source_url ?? "" } : null}
        categories={categories}
        nominees={[...nominees.values()]}
      />
    </>
  );
}
