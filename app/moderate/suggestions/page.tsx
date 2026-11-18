import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ModerationNav } from "../ModerationNav";
import { SuggestionRow, type Suggestion } from "./SuggestionRow";

export const metadata: Metadata = { title: "Data Suggestions · Moderation" };

export default function SuggestionsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Moderation</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <ModerationNav current="/moderate/suggestions" />
          <Suggestions />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

// The credit an award most likely means: "Lighting Design - Play" → Lighting Designer
const POSITIONS: Record<string, string> = {
  "Lighting Design": "Lighting Designer",
  "Sound Design": "Sound Designer",
  "Scenic Design": "Set Designer",
  "Costume Design": "Costume Designer",
  "Prop Design": "Props",
  "Makeup & Hair Design": "Hair and Makeup",
  "Set Dressing": "Set Decor",
  "Stage Management": "Stage Manager",
  Direction: "Director",
  "Music Direction": "Music Director",
  Choreography: "Choreographer",
  "Excellence in Fight Direction": "Fight Choreographer",
  "Excellence in Projection Design": "Projection Designer",
  "Excellence in Specialty Makeup": "Specialty Makeup",
  "Excellence in Dialect Work": "Dialect Coach",
  "Creature Design": "Creature Designer",
};

type Row = {
  id: string;
  person: { id: string; slug: string; display_name: string } | null;
  production: { id: string; slug: string; year: number; title_override: string | null; show: { title: string } | null; organization: { name: string } | null } | null;
  category: { name: string; kind: string } | null;
};

async function Suggestions() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/moderate/suggestions");
  if (!hasRole(user, "moderator")) return <p className="text-muted">Only moderators and the admin can see this.</p>;

  const supabase = await createClient();
  const { data } = await supabase
    .from("award_entries")
    .select(
      `id, person:people(id, slug, display_name),
       production:productions(id, slug, year, title_override, show:shows(title), organization:organizations(name)),
       category:award_categories(name, kind)`,
    )
    .not("person_id", "is", null)
    .not("production_id", "is", null)
    .is("credit_id", null)
    .eq("credit_check_dismissed", false);
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.person && r.production);

  // Anyone already credited in the show under another role
  const { data: credits } = rows.length
    ? await supabase
        .from("credits")
        .select("production_id, person_id, role_name, character:show_characters(name)")
        .in("production_id", [...new Set(rows.map((r) => r.production!.id))])
        .in("person_id", [...new Set(rows.map((r) => r.person!.id))])
    : { data: [] };

  // One suggestion per person and show
  const byKey = new Map<string, Suggestion>();
  for (const r of rows) {
    const key = `${r.person!.id}:${r.production!.id}`;
    const name = r.category?.name ?? "Award";
    const s = byKey.get(key) ?? {
      key,
      entryIds: [],
      person: { slug: r.person!.slug, name: r.person!.display_name },
      production: {
        slug: r.production!.slug,
        title: `${r.production!.title_override ?? r.production!.show?.title} (${r.production!.year})`,
        company: r.production!.organization?.name ?? "",
      },
      awards: [],
      cast: r.category?.kind === "performer" || r.category?.kind === "youth",
      role: "",
      credited: null,
    };
    s.entryIds.push(r.id);
    s.awards.push(name);
    if (!s.role) s.role = POSITIONS[name.split(" - ")[0]] ?? "";
    const c = (credits ?? []).find((c) => c.production_id === r.production!.id && c.person_id === r.person!.id);
    if (c) s.credited = c.character?.name ?? c.role_name ?? "cast";
    byKey.set(key, s);
  }
  const list = [...byKey.values()].sort((a, b) => a.production.title.localeCompare(b.production.title) || a.person.name.localeCompare(b.person.name));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="heading">Award names missing from credits</h2>
      {list.length ? (
        <>
          <p className="m-0 text-[15px] text-muted">{list.length} {list.length === 1 ? "person" : "people"}</p>
          <ul className="m-0 list-none border-t border-rule p-0">
            {list.map((s) => (
              <SuggestionRow key={s.key} s={s} />
            ))}
          </ul>
        </>
      ) : (
        <p className="m-0 text-muted">Nothing to suggest right now.</p>
      )}
    </section>
  );
}
