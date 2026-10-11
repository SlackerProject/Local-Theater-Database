import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PostEditor } from "../PostEditor";

export const metadata: Metadata = { title: "Write an update" };

export default function NewUpdatePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[36px] md:text-[48px]">Write an update</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Editor />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Editor() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/updates/new");
  if (!hasRole(user, "admin")) return <p className="m-0 text-muted">Only the admin writes updates.</p>;
  return <PostEditor post={null} userId={user.id} />;
}
