import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { looksLikeFormState } from "@/lib/submission";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { AddProductionForm } from "./AddProductionForm";

export const metadata: Metadata = { title: "Add a production · Local Theater Database" };

export default function AddProductionPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="flex flex-col gap-2">
            <h1 className="display text-[40px] md:text-[56px]">Add a production</h1>
            <p className="m-0 max-w-[640px] text-muted">
              One form adds the show, the company, the location, and everyone in it. Anything new gets created as you go.
            </p>
          </div>
          <Link href="/" className="link-quiet inline-flex min-h-11 items-center font-semibold text-muted">
            Cancel
          </Link>
        </div>
        <Suspense fallback={<p className="text-muted">Loading the form…</p>}>
          <FormForSignedInMember />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function FormForSignedInMember() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/add");

  const supabase = await createClient();
  const { data: draft } = await supabase
    .from("submission_drafts")
    .select("data")
    .eq("user_id", user.id)
    .maybeSingle();

  const initial = draft && looksLikeFormState(draft.data) ? draft.data : null;
  const defaultYear = new Date().toLocaleDateString("en-US", { year: "numeric", timeZone: "America/New_York" });
  return <AddProductionForm initial={initial} defaultYear={defaultYear} />;
}
