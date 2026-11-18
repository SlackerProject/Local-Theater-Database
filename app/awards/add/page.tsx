import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { AddAwardForm } from "./AddAwardForm";
import { ModerationNav } from "@/app/moderate/ModerationNav";

export const metadata: Metadata = { title: "Add Awards" };

export default function AddAwardsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Moderation</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Form />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Form() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/awards/add");
  if (!hasRole(user, "moderator")) {
    return (
      <p className="m-0">
        Awards are entered by moderators for now. Spotted a missing award? Use <strong>Feedback</strong> to let us know, with a
        link to where it was announced. <Link href="/awards">Back to the awards</Link>
      </p>
    );
  }
  const supabase = await createClient();
  const [{ data: ceremonies }, { data: categories }] = await Promise.all([
    supabase.from("award_ceremonies").select("id, name, season, source_url").order("year", { ascending: false }),
    supabase.from("award_categories").select("id, name, section, kind, sort_order").order("sort_order").order("name"),
  ]);
  return (
    <>
      <ModerationNav current="/awards/add" />
      <div className="flex flex-col gap-2">
        <h2 className="heading">Add Awards</h2>
        <p className="m-0 max-w-[680px] italic text-muted">
          Enter one award at a time. The ceremony, category and source link stay filled in, so you can add a whole category one
          after another. <Link href="/awards">See all awards</Link>
        </p>
      </div>
      <AddAwardForm
      ceremonies={(ceremonies ?? []).map((c) => ({ id: c.id, label: `${c.name} ${c.season}`, source_url: c.source_url }))}
      categories={categories ?? []}
    />
    </>
  );
}
