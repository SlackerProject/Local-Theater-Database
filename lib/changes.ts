import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

// Turns logged changes (the revisions table) into plain sentences for the
// notifications page and the moderators' dispute list.

export type Revision = {
  id: number;
  entity_table: string;
  entity_id: string;
  action: string;
  before: Json | null;
  after: Json | null;
  changed_by: string | null;
  changed_at: string;
};

export type DescribedChange = {
  who: string;
  summary: string; //  e.g. "added a credit: Laurie in Little Women (2026)"
  link: { href: string; label: string } | null;
};

type Row = Record<string, unknown>;
const obj = (j: Json | null): Row => (j && typeof j === "object" && !Array.isArray(j) ? (j as Row) : {});
const str = (v: unknown) => (typeof v === "string" ? v : null);

export async function describeChanges(
  supabase: SupabaseClient<Database>,
  revisions: Revision[],
): Promise<Map<number, DescribedChange>> {
  // Gather everything the sentences need, in a few queries
  const productionIds = new Set<string>();
  const characterIds = new Set<string>();
  const userIds = new Set<string>();
  for (const r of revisions) {
    const row = { ...obj(r.before), ...obj(r.after) };
    if (str(row.production_id)) productionIds.add(row.production_id as string);
    for (const side of [obj(r.before), obj(r.after)]) if (str(side.character_id)) characterIds.add(side.character_id as string);
    if (r.changed_by) userIds.add(r.changed_by);
  }
  const [{ data: productions }, { data: characters }, { data: profiles }] = await Promise.all([
    productionIds.size
      ? supabase.from("productions").select("id, slug, year, title_override, show:shows(title)").in("id", [...productionIds])
      : Promise.resolve({ data: [] as never[] }),
    characterIds.size
      ? supabase.from("show_characters").select("id, name").in("id", [...characterIds])
      : Promise.resolve({ data: [] as never[] }),
    userIds.size
      ? supabase.from("profiles").select("id, display_name").in("id", [...userIds])
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const production = new Map(
    (productions ?? []).map((p) => [p.id, { href: `/production/${p.slug}`, label: `${p.title_override ?? p.show?.title} (${p.year})` }]),
  );
  const character = new Map((characters ?? []).map((c) => [c.id, c.name]));
  const person = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const role = (side: Row) => (str(side.character_id) && character.get(side.character_id as string)) || str(side.role_name) || "a role";

  const out = new Map<number, DescribedChange>();
  for (const r of revisions) {
    const before = obj(r.before);
    const after = obj(r.after);
    const prod = production.get((str(after.production_id) ?? str(before.production_id)) as string) ?? null;
    const who = (r.changed_by && person.get(r.changed_by)) || "Someone";
    let summary = "changed your page";

    if (r.entity_table === "credits") {
      const where = prod ? ` in ${prod.label}` : "";
      if (r.action === "insert") summary = `added a credit: ${role(after)}${where}`;
      else if (r.action === "delete") summary = `removed your credit as ${role(before)}${where}`;
      else if (before.hidden_on_person_page !== after.hidden_on_person_page)
        summary = `${after.hidden_on_person_page ? "hid" : "showed"} your credit as ${role(after)}${where}`;
      else summary = `changed your role${where} from ${role(before)} to ${role(after)}`;
    } else if (r.entity_table === "people") {
      const changed: string[] = [];
      if (before.display_name !== after.display_name) changed.push(`changed your name to “${str(after.display_name)}”`);
      if (before.bio !== after.bio) changed.push("updated your bio");
      if (JSON.stringify(before.links) !== JSON.stringify(after.links)) changed.push("updated your links");
      if (before.headshot_media_id !== after.headshot_media_id)
        changed.push(after.headshot_media_id ? "changed your headshot" : "removed your headshot");
      if (before.is_hidden !== after.is_hidden) changed.push(after.is_hidden ? "hid your page" : "restored your page");
      if (changed.length) summary = changed.join(" and ");
    } else if (r.entity_table === "media") {
      const kind = str(after.kind) ?? str(before.kind);
      summary =
        kind === "headshot"
          ? "added a headshot of you"
          : kind === "poster"
            ? `added a poster${prod ? ` for ${prod.label}` : ""}`
            : `added a photo${prod ? ` to ${prod.label}` : ""}`;
    } else if (r.entity_table === "award_entries") {
      summary = r.action === "delete" ? "removed an award entry" : "added an award entry";
    }
    out.set(r.id, { who, summary, link: prod });
  }
  return out;
}
