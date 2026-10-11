import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasRole, type CurrentUser } from "@/lib/auth";
import { describeChanges, type Revision } from "@/lib/changes";
import { ClaimButtons, DisputeButtons, SuggestionButtons } from "./ModerationButtons";

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
// Suggested corrections to person pages (e.g. display names)
// ---------------------------------------------------------------------
export async function SuggestionsSection() {
  const supabase = await createClient();
  const { data: suggestions } = await supabase
    .from("edit_proposals")
    .select("id, entity_id, changes, note, created_at, proposer:profiles!edit_proposals_proposed_by_fkey(username, display_name)")
    .eq("entity_table", "people")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const ids = [...new Set((suggestions ?? []).map((s) => s.entity_id).filter((x): x is string => !!x))];
  const { data: people } = ids.length ? await supabase.from("people").select("id, slug, display_name, verified_owner_id").in("id", ids) : { data: [] };
  const personFor = new Map((people ?? []).map((p) => [p.id, p]));

  return (
    <section className="flex flex-col gap-4">
      <h2 className="heading">Suggested corrections</h2>
      {!suggestions?.length && <p className="m-0 text-muted">No suggestions waiting for review.</p>}
      {suggestions?.map((s) => {
        const person = s.entity_id ? personFor.get(s.entity_id) : undefined;
        const changes = (s.changes ?? {}) as { display_name?: string };
        return (
          <article key={s.id} className={item}>
            <p className="m-0 text-lg">
              <strong>{s.proposer?.display_name}</strong> suggests a correction to{" "}
              {person ? <Link href={`/person/${person.slug}`}>{person.display_name}</Link> : "a person page"}
              {person?.verified_owner_id && <span className="text-muted"> (their own verified page)</span>}.
            </p>
            {changes.display_name && (
              <p className="m-0">
                Name: <s className="text-muted">{person?.display_name}</s> → <strong>{changes.display_name}</strong>
              </p>
            )}
            {s.note && <p className="callout m-0 whitespace-pre-line text-[15px]">{s.note}</p>}
            {!changes.display_name && (
              <p className="m-0 text-sm text-muted">No name change. Make the described correction yourself, then mark this done.</p>
            )}
            <SuggestionButtons id={s.id} hasNameChange={!!changes.display_name} />
          </article>
        );
      })}
    </section>
  );
}
