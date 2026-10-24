import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { after } from "next/server";
import { fillVenuePins } from "@/lib/geocode";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Bundle } from "@/lib/submission";
import { sameNameMatches } from "@/lib/same-name";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ReviewCard } from "./ReviewCard";
import { UploadQueue, type QueueGroup } from "./UploadQueue";
import { AuditionsSection, AwardsSection, ClaimsSection, DisputesSection, QueueHeading } from "./sections";
import { KIND_FOR_TABLE } from "@/lib/corrections";
import { CorrectionsSection } from "./corrections";
import { ModerationNav } from "./ModerationNav";
import { ContributorTag, pointsFor } from "@/components/badges/ContributorMedal";
import { mediaUrl, type MediaPalette } from "@/lib/media";

export const metadata: Metadata = { title: "Moderation Queue" };

export default function ModeratePage({ searchParams }: PageProps<"/moderate">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Moderation</h1>
        <Suspense fallback={<p className="text-muted">Loading the queue…</p>}>
          <Queue searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/moderate">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/moderate");
  if (!hasRole(user, "trusted")) {
    return <p className="text-muted">Only trusted editors, moderators and admins can see the moderation queue.</p>;
  }
  // Trusted editors can only vouch for claims; everything else is for moderators
  if (!hasRole(user, "moderator")) return <ClaimsSection user={user} />;

  const params = await searchParams;
  const supabase = await createClient();
  // New venues get their map pins while moderators work the queue
  after(() => fillVenuePins(supabase));
  const [{ data: proposals, error }, { data: uploads }] = await Promise.all([
    supabase
      .from("edit_proposals")
      .select("id, changes, created_at, proposed_by, proposer:profiles!edit_proposals_proposed_by_fkey(username, display_name)")
      .eq("entity_table", "production_submission")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("media")
      .select(
        `id, kind, storage_key, thumb_key, photographer_credit, palette, created_at, uploaded_by,
         uploader:profiles!media_uploaded_by_fkey(username, display_name),
         production:productions!media_production_id_fkey(id, slug, year, title_override, show:shows(title), poster:media!productions_poster_fk(id, thumb_key, storage_key)),
         person:people!media_person_id_fkey(id, slug, display_name),
         organization:organizations!media_organization_id_fkey(id, slug, name)`,
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);

  // How many of each are waiting, for the summary at the top
  const [{ count: claimCount }, { count: disputeCount }, { data: otherProposals }] = await Promise.all([
    supabase.from("person_claims").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("status", "disputed"),
    supabase.from("edit_proposals").select("entity_table").eq("status", "pending").neq("entity_table", "production_submission").limit(2000),
  ]);
  const proposalCount = (tables: string[]) => (otherProposals ?? []).filter((p) => tables.includes(p.entity_table)).length;

  const { data: positionRows } = await supabase.from("crew_positions").select("name");
  const knownPositions = (positionRows ?? []).map((p) => p.name);

  // New people who are already on the site (e.g. added by another
  // submission approved since this one was sent)
  const sameName = await sameNameMatches(
    supabase,
    (proposals ?? []).flatMap((p) => ((p.changes as unknown as Bundle).people ?? []).flatMap((x) => ("new" in x ? [x.new.display_name] : []))),
  );

  // Venues that performances are at (when not the production's)
  const perfVenueIds = [
    ...new Set((proposals ?? []).flatMap((p) => ((p.changes as unknown as Bundle).performances ?? []).flatMap((pf) => (pf.location_id ? [pf.location_id] : [])))),
  ];
  const { data: perfVenues } = perfVenueIds.length ? await supabase.from("locations").select("id, name").in("id", perfVenueIds) : { data: [] };
  const venueNames = Object.fromEntries((perfVenues ?? []).map((v) => [v.id, v.name]));

  // Contributors' medals (moderation is a contribution context)
  const points = await pointsFor([...(proposals ?? []).map((p) => p.proposed_by), ...(uploads ?? []).map((m) => m.uploaded_by)]);

  // Group uploads by the production or person they're for
  const groups = new Map<string, QueueGroup>();
  for (const m of uploads ?? []) {
    const target = m.production
      ? {
          key: `production:${m.production.id}`,
          label: `${m.production.title_override ?? m.production.show?.title} (${m.production.year})`,
          href: `/production/${m.production.slug}`,
        }
      : m.person
        ? { key: `person:${m.person.id}`, label: m.person.display_name, href: `/person/${m.person.slug}` }
        : m.organization
          ? { key: `company:${m.organization.id}`, label: m.organization.name, href: `/company/${m.organization.slug}` }
        : null;
    if (!target) continue;
    const group = groups.get(target.key) ?? { ...target, items: [] };
    group.items.push({
      id: m.id,
      kind: m.kind,
      thumb: mediaUrl(m.thumb_key ?? m.storage_key)!,
      full: mediaUrl(m.storage_key)!,
      credit: m.photographer_credit,
      palette: (m.palette as MediaPalette | null) ?? null,
      uploader: `${m.uploader?.display_name} (@${m.uploader?.username})`,
      uploaderMedal: <ContributorTag points={points.get(m.uploaded_by)} />,
      // A new poster for a production that has one: show what it replaces
      replaces:
        m.kind === "poster" && m.production?.poster && m.production.poster.id !== m.id
          ? mediaUrl(m.production.poster.thumb_key ?? m.production.poster.storage_key)
          : null,
      uploadedAt: new Date(m.created_at).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }),
    });
    groups.set(target.key, group);
  }

  const waiting = [
    { id: "claims", label: "page claims", n: claimCount ?? 0 },
    { id: "disputes", label: "disputes", n: disputeCount ?? 0 },
    { id: "corrections", label: "corrections", n: proposalCount(Object.keys(KIND_FOR_TABLE)) },
    { id: "auditions", label: "audition dates", n: proposalCount(["auditions"]) },
    { id: "awards", label: "awards", n: proposalCount(["award_entries"]) },
    { id: "submissions", label: "productions", n: proposals?.length ?? 0 },
    { id: "uploads", label: "uploads", n: uploads?.length ?? 0 },
  ].filter((w) => w.n > 0);

  return (
    <>
      <ModerationNav current="/moderate" />
      <nav aria-label="Waiting for review" className="-mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px]">
        {waiting.length ? (
          <>
            <span className="font-semibold">Waiting:</span>
            {waiting.map((w, i) => (
              <span key={w.id}>
                <a href={`#${w.id}`} className="font-semibold">
                  {w.n} {w.label}
                </a>
                {i < waiting.length - 1 && <span className="text-muted"> ·</span>}
              </span>
            ))}
          </>
        ) : (
          <span className="text-muted">Nothing waiting for review. All caught up.</span>
        )}
      </nav>
      {typeof params.approved === "string" && (
        <Banner>
          Approved and published.{" "}
          {params.approved && (
            <Link href={`/production/${params.approved}`} className="font-semibold">
              View the production page
            </Link>
          )}
        </Banner>
      )}
      {params.rejected && <Banner>Submission rejected and sent back to the contributor.</Banner>}
      <ClaimsSection user={user} />
      <DisputesSection />
      <CorrectionsSection />
      <AuditionsSection />
      <AwardsSection />
      {(!!proposals?.length || error) && (
        <section className="flex flex-col">
          <QueueHeading id="submissions" title="Production Submissions" count={proposals?.length ?? 0} />
          {error && <p className="callout m-0">Couldn’t load the queue: {error.message}</p>}

          {proposals?.map((p) => (
            <ReviewCard
              key={p.id}
              id={p.id}
              submitted={p.changes as unknown as Bundle}
              submittedBy={`${p.proposer?.display_name} (@${p.proposer?.username})`}
              medal={<ContributorTag points={points.get(p.proposed_by)} />}
              knownPositions={knownPositions}
              sameName={sameName}
              venueNames={venueNames}
              submittedAt={new Date(p.created_at).toLocaleString("en-US", {
                timeZone: "America/New_York",
                dateStyle: "medium",
                timeStyle: "short",
              })}
            />
          ))}
        </section>
      )}

      {groups.size > 0 && (
        <section className="flex flex-col gap-2">
          <QueueHeading id="uploads" title="Photos, Posters, Headshots and Logos" count={uploads?.length ?? 0} />
          <UploadQueue groups={[...groups.values()]} />
        </section>
      )}
    </>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="callout m-0">
      {children}
    </p>
  );
}
