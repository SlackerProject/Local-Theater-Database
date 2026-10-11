import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasRole, type CurrentUser } from "@/lib/auth";
import { describeChanges, type Revision } from "@/lib/changes";
import { AuditionButtons, ClaimButtons, DisputeButtons, PageSuggestionButtons, SuggestionButtons } from "./ModerationButtons";

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
    .select("id, entity_id, changes, created_at, proposer:profiles!edit_proposals_proposed_by_fkey(username, display_name)")
    .eq("entity_table", "auditions")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const ids = [...new Set((proposals ?? []).map((p) => p.entity_id).filter((x): x is string => !!x))];
  const { data: prods } = ids.length
    ? await supabase.from("productions").select("id, slug, year, title_override, show:shows(title)").in("id", ids)
    : { data: [] };
  const prodFor = new Map((prods ?? []).map((p) => [p.id, p]));

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
              <strong>{p.proposer?.display_name}</strong> sent audition details for{" "}
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
// "Suggest an edit" notes on production, company, show and venue pages
// ---------------------------------------------------------------------
const PAGE_KINDS = {
  productions: { noun: "production", path: "production" },
  organizations: { noun: "company", path: "company" },
  shows: { noun: "show", path: "show" },
  locations: { noun: "venue", path: "venue" },
} as const;

export async function PageSuggestionsSection() {
  const supabase = await createClient();
  const { data: suggestions } = await supabase
    .from("edit_proposals")
    .select("id, entity_table, entity_id, note, created_at, proposer:profiles!edit_proposals_proposed_by_fkey(username, display_name)")
    .in("entity_table", Object.keys(PAGE_KINDS))
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  // Look up each page's name and address
  const ids = (t: string) => (suggestions ?? []).filter((s) => s.entity_table === t && s.entity_id).map((s) => s.entity_id!);
  const [prods, orgs, shows, venues] = await Promise.all([
    ids("productions").length
      ? supabase.from("productions").select("id, slug, year, title_override, show:shows(title)").in("id", ids("productions"))
      : Promise.resolve({ data: [] }),
    ids("organizations").length ? supabase.from("organizations").select("id, slug, name").in("id", ids("organizations")) : Promise.resolve({ data: [] }),
    ids("shows").length ? supabase.from("shows").select("id, slug, title").in("id", ids("shows")) : Promise.resolve({ data: [] }),
    ids("locations").length ? supabase.from("locations").select("id, slug, name").in("id", ids("locations")) : Promise.resolve({ data: [] }),
  ]);
  const pages = new Map<string, { slug: string; label: string }>();
  for (const p of prods.data ?? []) pages.set(p.id, { slug: p.slug, label: `${p.title_override ?? p.show?.title} (${p.year})` });
  for (const o of orgs.data ?? []) pages.set(o.id, { slug: o.slug, label: o.name });
  for (const s of shows.data ?? []) pages.set(s.id, { slug: s.slug, label: s.title });
  for (const v of venues.data ?? []) pages.set(v.id, { slug: v.slug, label: v.name });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="heading">Suggested edits</h2>
      {!suggestions?.length && <p className="m-0 text-muted">No suggested edits waiting for review.</p>}
      {suggestions?.map((s) => {
        const kind = PAGE_KINDS[s.entity_table as keyof typeof PAGE_KINDS];
        const page = s.entity_id ? pages.get(s.entity_id) : undefined;
        return (
          <article key={s.id} className={item}>
            <p className="m-0 text-lg">
              <strong>{s.proposer?.display_name}</strong> suggests an edit to{" "}
              {page ? (
                <Link href={`/${kind.path}/${page.slug}`} className="font-bold">
                  {page.label}
                </Link>
              ) : (
                `a ${kind.noun} that no longer exists`
              )}
              <span className="text-muted"> ({kind.noun})</span>.
            </p>
            <span className="text-sm text-muted">Sent {when(s.created_at)}</span>
            {s.note && <p className="callout m-0 whitespace-pre-line text-[15px]">{s.note}</p>}
            <p className="m-0 text-sm text-muted">
              Make the change yourself, then mark this done. Cast and crew can be added through “Add cast, crew, dates or a
              poster” on the production page.
            </p>
            <PageSuggestionButtons id={s.id} />
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
