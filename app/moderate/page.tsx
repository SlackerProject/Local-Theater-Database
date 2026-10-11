import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Bundle } from "@/lib/submission";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ReviewCard } from "./ReviewCard";
import { UploadQueue, type QueueGroup } from "./UploadQueue";
import { AuditionsSection, ClaimsSection, DisputesSection, PageSuggestionsSection, SuggestionsSection } from "./sections";
import { mediaUrl, type MediaPalette } from "@/lib/media";

export const metadata: Metadata = { title: "Moderation queue · Local Theater Database" };

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
  const [{ data: proposals, error }, { data: uploads }] = await Promise.all([
    supabase
      .from("edit_proposals")
      .select("id, changes, created_at, proposer:profiles!edit_proposals_proposed_by_fkey(username, display_name)")
      .eq("entity_table", "production_submission")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("media")
      .select(
        `id, kind, storage_key, thumb_key, photographer_credit, palette, created_at,
         uploader:profiles!media_uploaded_by_fkey(username, display_name),
         production:productions!media_production_id_fkey(id, slug, year, title_override, show:shows(title)),
         person:people!media_person_id_fkey(id, slug, display_name)`,
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);

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
      uploadedAt: new Date(m.created_at).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }),
    });
    groups.set(target.key, group);
  }

  return (
    <>
      <ClaimsSection user={user} />
      <DisputesSection />
      <PageSuggestionsSection />
      <SuggestionsSection />
      <AuditionsSection />
      <h2 className="heading -mb-2 mt-4">Production submissions</h2>
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
      {error && <p className="callout m-0">Couldn’t load the queue: {error.message}</p>}
      {!proposals?.length && !error && <p className="m-0 text-muted">No submissions waiting for review.</p>}

      {proposals?.map((p) => (
        <ReviewCard
          key={p.id}
          id={p.id}
          submitted={p.changes as unknown as Bundle}
          submittedBy={`${p.proposer?.display_name} (@${p.proposer?.username})`}
          submittedAt={new Date(p.created_at).toLocaleString("en-US", {
            timeZone: "America/New_York",
            dateStyle: "medium",
            timeStyle: "short",
          })}
        />
      ))}

      <h2 className="heading -mb-2 mt-8">Photos, posters and headshots</h2>
      {groups.size === 0 ? (
        <p className="m-0 text-muted">No uploads waiting for review.</p>
      ) : (
        <UploadQueue groups={[...groups.values()]} />
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
