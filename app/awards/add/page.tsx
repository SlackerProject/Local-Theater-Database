import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentTime } from "@/lib/calendar";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { AddAwardForm } from "./AddAwardForm";

export const metadata: Metadata = { title: "Add Awards" };

export default function AddAwardsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <div className="flex flex-col gap-2">
          <h1 className="display text-[40px] md:text-[56px]">Add Awards</h1>
          <p className="m-0 max-w-[680px] italic text-muted">
            Enter one nomination or win at a time. The awards, year and category stay filled in, so you can add every nominee in
            a category one after another.
          </p>
        </div>
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
  if (!hasRole(user, "trusted")) {
    return (
      <p className="m-0">
        Awards are entered by trusted editors and moderators. Spotted a missing award? Use <strong>Edit</strong> on the production
        page and describe it in the notes. <Link href="/awards">Back to the awards</Link>
      </p>
    );
  }
  const supabase = await createClient();
  const [{ data: bodies }, { data: categories }] = await Promise.all([
    supabase.from("award_bodies").select("id, name").order("name"),
    supabase.from("award_categories").select("id, name, award_body_id").order("name"),
  ]);
  return (
    <AddAwardForm
      bodies={bodies ?? []}
      categories={categories ?? []}
      defaultYear={String(currentTime().getFullYear())}
      isModerator={hasRole(user, "moderator")}
    />
  );
}
