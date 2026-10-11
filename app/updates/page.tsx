import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { postDate } from "@/lib/updates";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Updates", description: "News about the site: new features and changes." };

export default function UpdatesPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Updates />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Updates() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const isAdmin = hasRole(user, "admin");
  // Row rules show drafts to the admin only
  const { data: posts } = await supabase
    .from("posts")
    .select("id, slug, title, summary, status, published_at, updated_at")
    .order("published_at", { ascending: false, nullsFirst: true })
    .order("updated_at", { ascending: false });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="display text-[40px] md:text-[56px]">Updates</h1>
          <p className="m-0 text-muted">News about the site: new features and changes.</p>
        </div>
        {isAdmin && (
          <Link href="/updates/new" className="btn-primary">
            Write an update
          </Link>
        )}
      </div>
      {!posts?.length ? (
        <p className="m-0 text-muted">Updates will appear here.</p>
      ) : (
        <ul className="m-0 list-none border-t border-rule p-0">
          {posts.map((p) => (
            <li key={p.id} className="border-b border-rule">
              <Link href={`/updates/${p.slug}`} className="link-quiet flex flex-col gap-0.5 py-4">
                <span className="text-sm text-muted">
                  {p.status === "draft" ? <strong className="text-ink">Draft</strong> : postDate(p.published_at)}
                </span>
                <span className="text-lg font-extrabold leading-snug">{p.title}</span>
                {p.summary && <span className="text-[15px] text-muted">{p.summary}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
