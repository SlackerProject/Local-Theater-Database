import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasRole, type CurrentUser } from "@/lib/auth";
import { describeChanges, type Revision } from "@/lib/changes";
import { AuditionButtons, AwardButtons, ClaimButtons, DisputeButtons } from "./ModerationButtons";
import { ContributorMedal, pointsFor } from "@/components/badges/ContributorMedal";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

const item = "flex flex-col gap-2.5 border-t border-rule pt-4";

// ---------------------------------------------------------------------
// "Is this you?" claims
// ---------------------------------------------------------------------
export async function ClaimsSection({ user }: { user: CurrentUser }) {
  const supabase = await createClient();
  const { data: claims } = await supabase
    .from("person_claims")
    .select(
      `id, user_id, evidence_url, evidence_note, created_at, vouched_by,
       person:people(slug, display_name),
       claimant:profiles!person_claims_user_id_fkey(username, display_name),
       voucher:profiles!person_claims_vouched_by_fkey(display_name)`,
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="heading">Page claims</h2>
      {!claims?.length && <p className="m-0 text-muted">No claims waiting for review.</p>}
      {claims?.map((c) => (
        <article key={c.id} className={item}>
          <p className="m-0 text-lg">
            <strong>
              {c.claimant?.display_name} (@{c.claimant?.username})
            </strong>{" "}
            says they’re{" "}
            {c.person ? (
              <Link href={`/person/${c.person.slug}`} className="font-bold">
                {c.person.display_name}
              </Link>
            ) : (
              "a hidden page"
            )}
            .
          </p>
          <span className="text-sm text-muted">Claimed {when(c.created_at)}</span>
          {c.evidence_url ? (
            <p className="m-0">
              Evidence:{" "}
              <a href={c.evidence_url} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-semibold">
                {c.evidence_url}
              </a>
            </p>
          ) : (
            <p className="m-0 text-muted">No evidence link given.</p>
          )}
          {c.evidence_note && <p className="callout m-0 whitespace-pre-line text-[15px]">{c.evidence_note}</p>}
          {c.vouched_by && <p className="m-0 text-[15px]">✓ {c.voucher?.display_name ?? "A trusted editor"} knows this person.</p>}
          <ClaimButtons
            id={c.id}
            canVerify={hasRole(user, "moderator")}
            isAdmin={hasRole(user, "admin")}
            ownClaim={c.user_id === user.id}
            canVouch={hasRole(user, "trusted")}
            vouched={!!c.vouched_by}
          />
        </article>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------
// Owners disputing a change to their page
// ---------------------------------------------------------------------
const UNDOABLE = new Set(["credits:insert", "credits:update", "people:update", "media:insert", "media:update"]);

export async function DisputesSection() {
  const supabase = await createClient();
  const { data: disputes } = await supabase
    .from("notifications")
    .select(
      `id, dispute_note, created_at,
       owner:profiles!notifications_user_id_fkey(display_name, username, person_id),
       revision:revisions(id, entity_table, entity_id, action, before, after, changed_by, changed_at)`,
    )
    .eq("status", "disputed")
    .order("created_at", { ascending: true });

  const revisions = (disputes ?? []).map((d) => d.revision).filter((r): r is Revision => !!r);
  const described = await describeChanges(supabase, revisions);
  const personIds = [...new Set((disputes ?? []).map((d) => d.owner?.person_id).filter((x): x is string => !!x))];
  const { data: pages } = personIds.length
    ? await supabase.from("people").select("id, slug").in("id", personIds)
    : { data: [] };
  const pageFor = new Map((pages ?? []).map((p) => [p.id, p.slug]));

  return (
    <section className="flex flex-col gap-4">
      <h2 className="heading">Disputed changes</h2>
      {!disputes?.length && <p className="m-0 text-muted">No disputes waiting for review.</p>}
      {disputes?.map((d) => {
        const change = d.revision ? described.get(d.revision.id) : null;
        const slug = d.owner?.person_id ? pageFor.get(d.owner.person_id) : undefined;
        return (
          <article key={d.id} className={item}>
            <p className="m-0 text-lg">
              <strong>{d.owner?.display_name}</strong> disputes this change to{" "}
              {slug ? <Link href={`/person/${slug}`}>their page</Link> : "their page"}:
            </p>
            <p className="m-0">
              {change ? `${change.who} ${change.summary}.` : "A change to their page."}
              {change?.link && (
                <>
                  {" "}
                  <Link href={change.link.href}>{change.link.label}</Link>
                </>
              )}
            </p>
            {d.dispute_note ? (
              <p className="callout m-0 text-[15px]">“{d.dispute_note}”</p>
            ) : (
              <p className="m-0 text-sm text-muted">No reason given.</p>
            )}
            <DisputeButtons id={d.id} canUndo={!!d.revision && UNDOABLE.has(`${d.revision.entity_table}:${d.revision.action}`)} />
          </article>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------
// Audition dates sent in by members (trusted editors publish directly)
// ---------------------------------------------------------------------
type AuditionChanges = {
  sessions?: { date: string; start: string; end: string; place: string }[];
  note?: string;
  url?: string;
};

const sessionText = (s: { date: string; start: string; end: string }) => {
  const day = new Date(`${s.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const t = (hhmm: string) => new Date(`2000-01-01T${hhmm}:00Z`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  return `${day}${s.start ? ` · ${t(s.start)}` : ""}${s.end ? ` – ${t(s.end)}` : ""}`;
};

export async function AuditionsSection() {
  const supabase = await createClient();
  const { data: proposals } = await supabase
    .from("edit_proposals")
    .select("id, entity_id, changes, created_at, proposed_by, proposer:profiles!edit_proposals_proposed_by_fkey(username, display_name)")
    .eq("entity_table", "auditions")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const ids = [...new Set((proposals ?? []).map((p) => p.entity_id).filter((x): x is string => !!x))];
  const { data: prods } = ids.length
    ? await supabase.from("productions").select("id, slug, year, title_override, show:shows(title)").in("id", ids)
    : { data: [] };
  const prodFor = new Map((prods ?? []).map((p) => [p.id, p]));
  const points = await pointsFor((proposals ?? []).map((p) => p.proposed_by));

  return (
    <section className="flex flex-col gap-4">
      <h2 className="heading">Audition dates</h2>
      {!proposals?.length && <p className="m-0 text-muted">No audition dates waiting for review.</p>}
      {proposals?.map((p) => {
        const prod = p.entity_id ? prodFor.get(p.entity_id) : undefined;
        const c = (p.changes ?? {}) as AuditionChanges;
        return (
          <article key={p.id} className={item}>
            <p className="m-0 text-lg">
              <strong>{p.proposer?.display_name}</strong> <ContributorMedal points={points.get(p.proposed_by)} /> sent audition
              details for{" "}
              {prod ? (
                <Link href={`/production/${prod.slug}`} className="font-bold">
                  {prod.title_override ?? prod.show?.title} ({prod.year})
                </Link>
              ) : (
                "a production"
              )}
              .
            </p>
            <span className="text-sm text-muted">Sent {when(p.created_at)}. Publishing replaces the current audition details.</span>
            {c.sessions?.length ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {c.sessions.map((s, i) => (
                  <li key={i}>
                    {sessionText(s)}
                    {s.place && <span className="text-muted"> · {s.place}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0">No dates (the page will say “Audition dates: TBD”).</p>
            )}
            {c.note && <p className="callout m-0 whitespace-pre-line text-[15px]">{c.note}</p>}
            {c.url && (
              <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-[15px] font-semibold">
                {c.url}
              </a>
            )}
            <AuditionButtons id={p.id} />
          </article>
        );
      })}
    </section>
  );
}


// ---------------------------------------------------------------------
// Award entries from trusted editors (moderators' entries publish at once)
// ---------------------------------------------------------------------
type AwardChanges = {
  body_id?: string;
  new_body?: string;
  year?: string;
  category_id?: string;
  new_category?: string;
  production_id?: string;
  credit_id?: string;
  result?: "nominated" | "won";
};

export async function AwardsSection() {
  const supabase = await createClient();
  const { data: proposals } = await supabase
    .from("edit_proposals")
    .select("id, changes, note, created_at, proposed_by, proposer:profiles!edit_proposals_proposed_by_fkey(username, display_name)")
    .eq("entity_table", "award_entries")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (!proposals?.length) return null;

  const all = proposals.map((p) => (p.changes ?? {}) as AwardChanges);
  const pick = (k: keyof AwardChanges) => [...new Set(all.map((c) => c[k]).filter((x): x is string => !!x))];
  const [{ data: bodies }, { data: cats }, { data: prods }, { data: credits }] = await Promise.all([
    supabase.from("award_bodies").select("id, name").in("id", pick("body_id").length ? pick("body_id") : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("award_categories").select("id, name").in("id", pick("category_id").length ? pick("category_id") : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("productions").select("id, slug, year, title_override, show:shows(title)").in("id", pick("production_id").length ? pick("production_id") : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("credits").select("id, role_name, person:people(display_name), character:show_characters(name)").in("id", pick("credit_id").length ? pick("credit_id") : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const points = await pointsFor(proposals.map((p) => p.proposed_by));

  return (
    <section className="flex flex-col gap-4">
      <h2 className="heading">Awards</h2>
      {proposals.map((p) => {
        const c = (p.changes ?? {}) as AwardChanges;
        const body = c.body_id ? bodies?.find((b) => b.id === c.body_id)?.name : `${c.new_body} (new)`;
        const cat = c.category_id ? cats?.find((x) => x.id === c.category_id)?.name : `${c.new_category} (new category)`;
        const prod = prods?.find((x) => x.id === c.production_id);
        const credit = credits?.find((x) => x.id === c.credit_id);
        return (
          <article key={p.id} className={item}>
            <p className="m-0 text-lg">
              <strong>{p.proposer?.display_name}</strong> <ContributorMedal points={points.get(p.proposed_by)} /> added an award
            </p>
            <span className="text-sm text-muted">Sent {when(p.created_at)}</span>
            <p className="m-0">
              <strong>{c.result === "won" ? "Won" : "Nominated"}</strong>, {cat}, {body} awards {c.year}
              {prod && (
                <>
                  {" · "}
                  <Link href={`/production/${prod.slug}`}>
                    {prod.title_override ?? prod.show?.title} ({prod.year})
                  </Link>
                </>
              )}
              {credit && ` · ${credit.person?.display_name} (${credit.character?.name ?? credit.role_name})`}
            </p>
            {p.note && <p className="callout m-0 whitespace-pre-line text-[15px]">{p.note}</p>}
            <AwardButtons id={p.id} />
          </article>
        );
      })}
    </section>
  );
}
