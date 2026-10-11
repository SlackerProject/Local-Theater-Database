import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { KIND_FOR_TABLE, type PageTable } from "@/lib/corrections";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ModerationNav } from "../ModerationNav";
import { ContributorTag, pointsFor } from "@/components/badges/ContributorMedal";

export const metadata: Metadata = { title: "Recent changes · Moderation" };

export default function ChangesPage({ searchParams }: PageProps<"/moderate/changes">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Moderation</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <ModerationNav current="/moderate/changes" />
          <Changes searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const KIND_TEXT: Record<string, string> = {
  production_submission: "Added a production",
  productions: "Corrected a production",
  people: "Corrected a person",
  organizations: "Corrected a company",
  shows: "Corrected a show",
  locations: "Corrected a venue",
  auditions: "Audition dates",
  award_entries: "Added an award",
};
const MEDIA_TEXT: Record<string, string> = { poster: "Uploaded a poster", production_photo: "Uploaded a photo", headshot: "Uploaded a headshot" };
const STATUS: Record<string, string> = { pending: "Waiting", approved: "Approved", rejected: "Rejected" };

const cell = "border-b border-[#CFCFCF] p-2.5 align-top text-left";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

type Item = { at: string; who: { id: string; name: string } | null; what: string; page: { href: string; label: string } | null; status: string };

async function Changes({ searchParams }: Pick<PageProps<"/moderate/changes">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/moderate/changes");
  if (!hasRole(user, "moderator")) return <p className="text-muted">Only moderators and the admin can see recent changes.</p>;

  const { user: filter } = await searchParams;
  const only = typeof filter === "string" && /^[0-9a-f-]{36}$/i.test(filter) ? filter : null;
  const supabase = await createClient();

  let proposalQuery = supabase
    .from("edit_proposals")
    .select("id, entity_table, entity_id, changes, status, created_at, proposed_by, proposer:profiles!edit_proposals_proposed_by_fkey(id, display_name)")
    .order("created_at", { ascending: false })
    .limit(150);
  let mediaQuery = supabase
    .from("media")
    .select(
      `id, kind, status, created_at, uploader:profiles!media_uploaded_by_fkey(id, display_name),
       production:productions!media_production_id_fkey(slug, year, title_override, show:shows(title)),
       person:people!media_person_id_fkey(slug, display_name)`,
    )
    .order("created_at", { ascending: false })
    .limit(60);
  if (only) {
    proposalQuery = proposalQuery.eq("proposed_by", only);
    mediaQuery = mediaQuery.eq("uploaded_by", only);
  }
  const [{ data: proposals }, { data: media }, { data: who }] = await Promise.all([
    proposalQuery,
    mediaQuery,
    only ? supabase.from("profiles").select("display_name, username, banned_at").eq("id", only).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  // Page names for the corrected pages, one query per kind of page
  const byTable = new Map<string, Set<string>>();
  for (const p of proposals ?? []) {
    const t = p.entity_table === "production_submission" || p.entity_table === "auditions" ? "productions" : p.entity_table;
    if (p.entity_id && t in KIND_FOR_TABLE) byTable.set(t, (byTable.get(t) ?? new Set()).add(p.entity_id));
  }
  const pages = new Map<string, { href: string; label: string }>();
  await Promise.all(
    [...byTable].map(async ([t, ids]) => {
      const table = t as PageTable;
      const select = table === "productions" ? "id, slug, year, title_override, show:shows(title)" : table === "people" ? "id, slug, display_name" : table === "shows" ? "id, slug, title" : "id, slug, name";
      const { data } = await supabase.from(table).select(select).in("id", [...ids]);
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
        const show = r.show as { title: string } | null | undefined;
        const label = table === "productions" ? `${(r.title_override as string) ?? show?.title} (${r.year})` : String(r.display_name ?? r.title ?? r.name);
        pages.set(String(r.id), { href: `/${KIND_FOR_TABLE[table]}/${r.slug}`, label });
      }
    }),
  );

  const items: Item[] = [
    ...(proposals ?? []).map((p) => {
      const draftTitle = (p.changes as { production?: { display_title?: string } } | null)?.production?.display_title;
      return {
        at: p.created_at,
        who: p.proposer ? { id: p.proposer.id, name: p.proposer.display_name } : null,
        what: KIND_TEXT[p.entity_table] ?? p.entity_table,
        page: (p.entity_id && pages.get(p.entity_id)) || (draftTitle ? { href: "/moderate", label: draftTitle } : null),
        status: STATUS[p.status] ?? p.status,
      };
    }),
    ...(media ?? []).map((m) => ({
      at: m.created_at,
      who: m.uploader ? { id: m.uploader.id, name: m.uploader.display_name } : null,
      what: MEDIA_TEXT[m.kind] ?? "Uploaded an image",
      page: m.production
        ? { href: `/production/${m.production.slug}`, label: `${m.production.title_override ?? m.production.show?.title} (${m.production.year})` }
        : m.person
          ? { href: `/person/${m.person.slug}`, label: m.person.display_name }
          : null,
      status: STATUS[m.status] ?? m.status,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const points = await pointsFor(items.map((it) => it.who?.id));

  return (
    <>
      <p className="m-0 max-w-[760px] text-[15px] text-muted">
        Everything sent to the site, newest first: submissions, corrections, audition dates and uploads, with what happened
        to each. Click a name to see only their changes.
      </p>
      {only && (
        <p className="callout m-0 flex flex-wrap items-center gap-x-3">
          <span>
            Showing changes by <strong>{who?.display_name ?? "this member"}</strong>
            {who?.username && <span className="text-muted"> (@{who.username})</span>}
            {who?.banned_at && <strong> · Suspended</strong>}
          </span>
          <Link href={`/moderate/members?q=${encodeURIComponent(who?.username ?? "")}`} className="font-semibold">
            Manage this member
          </Link>
          <Link href="/moderate/changes" className="font-semibold">
            Show everyone
          </Link>
        </p>
      )}
      {items.length === 0 ? (
        <p className="m-0 text-muted">Nothing yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse border border-[#CFCFCF] text-[15px]">
            <thead>
              <tr className="bg-soft">
                <th scope="col" className={cell}>When</th>
                <th scope="col" className={cell}>Who</th>
                <th scope="col" className={cell}>What</th>
                <th scope="col" className={cell}>Page</th>
                <th scope="col" className={cell}>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td className={`${cell} whitespace-nowrap text-muted`}>{when(it.at)}</td>
                  <td className={cell}>
                    {it.who ? (
                      <span className="inline-flex items-center gap-1">
                        <Link href={`/moderate/changes?user=${it.who.id}`}>{it.who.name}</Link>
                        <ContributorTag points={points.get(it.who.id)} />
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={cell}>{it.what}</td>
                  <td className={cell}>{it.page ? <Link href={it.page.href}>{it.page.label}</Link> : <span className="text-muted">—</span>}</td>
                  <td className={`${cell} ${it.status === "Waiting" ? "font-bold" : ""}`}>{it.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
