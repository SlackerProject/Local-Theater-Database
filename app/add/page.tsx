import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { looksLikeFormState } from "@/lib/submission";
import { SITE_NAME } from "@/components/SiteHeader";
import { AddProductionForm } from "./AddProductionForm";

export const metadata: Metadata = { title: "Add a production · Local Theater Database" };

export default function AddProductionPage() {
  return (
    <>
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="font-serif text-2xl text-ink no-underline">
            {SITE_NAME}
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center text-[15px] font-semibold text-muted no-underline">
            Cancel
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-7 px-4 pb-16 pt-8 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 font-serif text-[36px] font-normal leading-[1.05] sm:text-[44px]">Add a production</h1>
          <p className="m-0 max-w-[640px] text-muted">
            One form adds the show, the company, the location, and everyone in it. Anything new gets created as you go.
          </p>
        </div>
        <Suspense fallback={<p className="text-muted">Loading the form…</p>}>
          <FormForSignedInMember />
        </Suspense>
      </main>
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
