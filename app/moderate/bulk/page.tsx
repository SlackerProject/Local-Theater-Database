import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentTime } from "@/lib/calendar";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ModerationNav } from "../ModerationNav";
import { BulkUpload } from "./BulkUpload";
import { UndoUploadButton } from "./UndoUploadButton";

export const metadata: Metadata = { title: "Bulk Upload · Moderation" };

export default function BulkUploadPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Moderation</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <ModerationNav current="/moderate/bulk" />
          <Bulk />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

// Many productions at once from a spreadsheet, for a company's back catalog
async function Bulk() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/moderate/bulk");
  if (!hasRole(user, "moderator")) return <p className="text-muted">Only moderators and the admin can bulk upload.</p>;

  await connection();
  const now = currentTime();
  const supabase = await createClient();
  const { data: uploads } = await supabase
    .from("bulk_imports")
    .select("id, file_name, created_at, created_ids, replaced_ids, undone_at, by:profiles!bulk_imports_created_by_fkey(display_name)")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <>
      <p className="-mt-4 m-0 max-w-[760px] text-[15px] text-muted">
        Add a company’s past productions from one spreadsheet: shows, companies, venues, dates, cast and crew. Everything is matched to
        what’s already on the site, and you review it all before anything is saved.
      </p>
      <BulkUpload maxYear={now.getFullYear() + 2} />

      {!!uploads?.length && (
        <section className="flex flex-col gap-2">
          <h2 className="heading">Recent Uploads</h2>
          <ul className="m-0 flex list-none flex-col border-t border-rule p-0 text-[15px]">
            {uploads.map((u) => {
              const canUndo = !u.undone_at && now.getTime() - new Date(u.created_at).getTime() < 7 * 86400000 && u.created_ids.length > 0;
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule py-2">
                  <span className="min-w-0 flex-1">
                    <strong>{u.file_name}</strong>{" "}
                    <span className="text-sm text-muted">
                      · {when(u.created_at)} · {u.by?.display_name ?? "A moderator"} · {u.created_ids.length} added
                      {u.replaced_ids.length ? `, ${u.replaced_ids.length} replaced` : ""}
                      {u.undone_at && ` · undone ${when(u.undone_at)}`}
                    </span>
                  </span>
                  {canUndo && <UndoUploadButton id={u.id} count={u.created_ids.length} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
