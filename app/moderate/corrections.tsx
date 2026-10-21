import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  FIELDS,
  KIND_FOR_TABLE,
  KINDS,
  normalizeChanges,
  performanceText,
  type FieldValue,
  type PageTable,
} from "@/lib/corrections";
import { SHOW_TYPES } from "@/lib/submission";
import { localDate, localHHMM } from "@/lib/calendar";
import { CorrectionReview, type ReviewRow } from "./CorrectionReview";
import { unlistedPositions } from "@/lib/positions";
import { personNameKey, sameNameMatches } from "@/lib/same-name";
import { ContributorTag, pointsFor } from "@/components/badges/ContributorMedal";
import { QueueHeading } from "./sections";

const TABLES = Object.keys(KIND_FOR_TABLE) as PageTable[];

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function names(supabase: Supabase, table: "organizations" | "locations" | "people", ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const col = table === "people" ? "display_name" : "name";
  const { data } = await supabase.from(table).select(`id, ${col}`).in("id", ids);
  return new Map(((data ?? []) as unknown as Record<string, string>[]).map((r) => [r.id, r[col]]));
}

// ---------------------------------------------------------------------
// Corrections from the Edit pages (and older "suggest a correction" notes)
// ---------------------------------------------------------------------
export async function CorrectionsSection() {
  const supabase = await createClient();
  const { data: proposals } = await supabase
    .from("edit_proposals")
    .select("id, entity_table, entity_id, changes, note, created_at, proposed_by, proposer:profiles!edit_proposals_proposed_by_fkey(username, display_name)")
    .in("entity_table", TABLES)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const { data: positionRows } = await supabase.from("crew_positions").select("name");
  const knownPositions = (positionRows ?? []).map((p) => p.name);
  const cards = await Promise.all((proposals ?? []).map((p) => buildCard(supabase, p, knownPositions)));
  const points = await pointsFor((proposals ?? []).map((p) => p.proposed_by));

  if (!cards.length) return null;
  return (
    <section className="flex flex-col">
      <QueueHeading id="corrections" title="Corrections" count={cards.length} />
      {cards.map((c) => (
        <article key={c.id} className="flex flex-col gap-2 border-t border-rule py-3">
          <p className="m-0 text-base">
            <Link href={`/moderate/members?q=${encodeURIComponent(c.username)}`} className="font-bold">
              {c.who}
            </Link>{" "}
            <ContributorTag points={points.get(c.proposedBy)} /> sent a correction for{" "}
            {c.page ? (
              <Link href={c.page.href} className="font-bold">
                {c.page.label}
              </Link>
            ) : (
              "a page that no longer exists"
            )}{" "}
            <span className="text-muted">({c.noun})</span> <span className="text-sm text-muted">· {c.sent}</span>
          </p>
          {c.note && (
            <p className="m-0 border-l-2 border-rule pl-3 whitespace-pre-line text-[15px] text-muted">
              <strong className="text-ink">Note:</strong> {c.note}
            </p>
          )}
          <CorrectionReview id={c.id} rows={c.rows} newPositions={c.newPositions} />
        </article>
      ))}
    </section>
  );
}

type Proposal = {
  id: string;
  entity_table: string;
  entity_id: string | null;
  changes: unknown;
  note: string | null;
  created_at: string;
  proposed_by: string;
  proposer: { username: string; display_name: string } | null;
};

async function buildCard(supabase: Supabase, p: Proposal, knownPositions: string[]) {
  const table = p.entity_table as PageTable;
  const kind = KIND_FOR_TABLE[table];
  const c = normalizeChanges(p.changes);
  const fields = FIELDS[table];
  const rows: ReviewRow[] = [];
  const crewRoles: string[] = (c.credits?.add ?? []).filter((a) => a.kind === "crew").map((a) => a.role);

  // The page as it is now
  const cols = ["id", "slug", ...fields.map((f) => f.key)].join(", ");
  const { data: live } = p.entity_id ? await supabase.from(table).select(cols).eq("id", p.entity_id).maybeSingle() : { data: null };
  const now = (live ?? null) as unknown as (Record<string, FieldValue> & { slug: string }) | null;

  let label = now ? String(now.display_name ?? now.name ?? now.title ?? now.slug) : "";
  if (table === "productions" && p.entity_id) {
    const { data: prod } = await supabase.from("productions").select("year, title_override, show:shows(title)").eq("id", p.entity_id).maybeSingle();
    if (prod) label = `${prod.title_override ?? prod.show?.title} (${prod.year})`;
  }

  // Readable names for picked companies, venues and people
  const proposed = c.fields ?? {};
  const orgs = await names(supabase, "organizations", [proposed.organization_id, now?.organization_id].filter((x): x is string => typeof x === "string" && !!x));
  const venues = await names(supabase, "locations", [proposed.location_id, now?.location_id].filter((x): x is string => typeof x === "string" && !!x));
  const pretty = (key: string, v: FieldValue | undefined) => {
    if (v === null || v === undefined || v === "") return "";
    if (key === "organization_id") return orgs.get(String(v)) ?? "(unknown company)";
    if (key === "location_id") return venues.get(String(v)) ?? "(unknown venue)";
    if (key === "type") return SHOW_TYPES.find((t) => t.value === v)?.label ?? String(v);
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return new Date(`${v}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    }
    return String(v);
  };

  for (const f of fields) {
    if (!(f.key in proposed)) continue;
    rows.push({ key: `field:${f.key}`, what: f.label, current: pretty(f.key, now?.[f.key]), proposed: pretty(f.key, proposed[f.key]) });
  }

  // The show's roles (from the show's page or one of its productions)
  if (c.roles) {
    const ids = [...(c.roles.remove ?? []), ...(c.roles.rename ?? []).map((r) => r.id)];
    const { data: chars } = ids.length ? await supabase.from("show_characters").select("id, name").in("id", ids) : { data: [] };
    const charName = new Map((chars ?? []).map((ch) => [ch.id, ch.name]));
    for (const id of c.roles.remove ?? []) {
      rows.push({ key: `role:remove:${id}`, what: "Remove role", current: charName.get(id) ?? "(already gone)", proposed: "Removed" });
    }
    for (const r of c.roles.rename ?? []) {
      rows.push({ key: `role:rename:${r.id}`, what: "Rename role", current: charName.get(r.id) ?? "(role is gone)", proposed: r.name });
    }
    (c.roles.add ?? []).forEach((name, i) => {
      rows.push({ key: `role:add:${i}`, what: "Add role", current: "", proposed: name });
    });
  }

  if (table === "productions" && p.entity_id) {
    const creditIds = [...(c.credits?.remove ?? []), ...(c.credits?.update ?? []).map((u) => u.id)];
    const { data: credits } = creditIds.length
      ? await supabase.from("credits").select("id, kind, role_name, is_understudy, is_young_performer, person:people(display_name), character:show_characters(name)").in("id", creditIds)
      : { data: [] };
    const credit = new Map((credits ?? []).map((cr) => [cr.id, cr]));
    const people = await names(supabase, "people", (c.credits?.add ?? []).map((a) => a.person_id).filter((x): x is string => !!x));
    // New people who are already on the site get linked to them unless marked different
    const sameName = await sameNameMatches(supabase, (c.credits?.add ?? []).flatMap((a) => (a.new_name ? [a.new_name] : [])));

    for (const id of c.credits?.remove ?? []) {
      const cr = credit.get(id);
      rows.push({
        key: `credit:remove:${id}`,
        what: `Remove from ${cr?.kind === "crew" ? "creative team" : "cast"}`,
        current: cr
          ? `${cr.is_young_performer ? "Young performer" : cr.person?.display_name} — ${cr.is_understudy ? "Understudy for " : ""}${cr.character?.name ?? cr.role_name ?? ""}`
          : "(already gone)",
        proposed: "Removed",
      });
    }
    for (const u of c.credits?.update ?? []) {
      const cr = credit.get(u.id);
      if (cr?.kind === "crew") crewRoles.push(u.role);
      rows.push({
        key: `credit:update:${u.id}`,
        what: `Change ${cr?.kind === "crew" ? "position" : "role"}: ${cr?.is_young_performer ? "Young performer" : (cr?.person?.display_name ?? "?")}`,
        current: cr ? (cr.character?.name ?? cr.role_name ?? "") : "(credit is gone)",
        proposed: u.role,
      });
    }
    (c.credits?.add ?? []).forEach((a, i) => {
      const who = a.young
        ? "Young performer (under 18, no name)"
        : a.person_id
          ? (people.get(a.person_id) ?? a.person_label ?? "(unknown person)")
          : `${a.new_name} (new person, confirmed 18+)`;
      const match = a.new_name && !a.distinct ? sameName[personNameKey(a.new_name)]?.[0] : undefined;
      rows.push({
        key: `credit:add:${i}`,
        what: `Add to ${a.kind === "crew" ? "creative team" : "cast"}`,
        current: "",
        proposed: `${who} — ${a.understudy ? `Understudy for ${a.role}` : a.role}`,
        ...(match && { sameName: { distinctKey: `distinct:credit:add:${i}`, name: a.new_name!, match } }),
      });
    });

    const perfIds = [...(c.performances?.remove ?? []), ...(c.performances?.update ?? []).map((u) => u.id)];
    const { data: perfs } = perfIds.length
      ? await supabase.from("performances").select("id, starts_at, label, is_cancelled, location_id").in("id", perfIds)
      : { data: [] };
    const perf = new Map((perfs ?? []).map((x) => [x.id, x]));
    // Performances at a venue other than the production's say where
    const perfVenues = await names(
      supabase,
      "locations",
      [...(perfs ?? []).map((x) => x.location_id), ...(c.performances?.add ?? []).map((a) => a.location_id), ...(c.performances?.update ?? []).map((u) => u.location_id)].filter(
        (x): x is string => !!x,
      ),
    );
    const at = (id: string | null | undefined) => (id ? ` · at ${perfVenues.get(id) ?? "another venue"}` : "");
    const perfLabel = (x: { starts_at: string; label: string | null; is_cancelled: boolean; location_id: string | null } | undefined) =>
      x
        ? `${performanceText(localDate(x.starts_at), localHHMM(x.starts_at))}${x.label ? ` · ${x.label}` : ""}${x.is_cancelled ? " · Cancelled" : ""}${at(x.location_id)}`
        : "(already gone)";

    for (const id of c.performances?.remove ?? []) {
      rows.push({ key: `perf:remove:${id}`, what: "Remove performance", current: perfLabel(perf.get(id)), proposed: "Removed" });
    }
    for (const u of c.performances?.update ?? []) {
      rows.push({
        key: `perf:update:${u.id}`,
        what: "Change performance",
        current: perfLabel(perf.get(u.id)),
        proposed: `${performanceText(u.date, u.time)}${u.label ? ` · ${u.label}` : ""}${u.cancelled ? " · Cancelled" : ""}${at(u.location_id === undefined ? perf.get(u.id)?.location_id : u.location_id)}`,
      });
    }
    (c.performances?.add ?? []).forEach((a, i) => {
      rows.push({ key: `perf:add:${i}`, what: "Add performance", current: "", proposed: `${performanceText(a.date, a.time)}${a.label ? ` · ${a.label}` : ""}${at(a.location_id)}` });
    });
  }

  return {
    id: p.id,
    who: p.proposer?.display_name ?? "Someone",
    proposedBy: p.proposed_by,
    username: p.proposer?.username ?? "",
    noun: KINDS[kind].noun,
    page: now ? { href: `/${kind}/${now.slug}`, label } : null,
    sent: when(p.created_at),
    note: p.note,
    rows,
    newPositions: unlistedPositions(crewRoles, knownPositions),
  };
}
