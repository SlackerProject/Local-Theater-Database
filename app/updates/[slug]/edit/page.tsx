import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PostEditor } from "../../PostEditor";

export const metadata: Metadata = { title: "Edit update" };

export default function EditUpdatePage({ params }: PageProps<"/updates/[slug]/edit">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[36px] md:text-[48px]">Edit update</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Editor params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Editor({ params }: Pick<PageProps<"/updates/[slug]/edit">, "params">) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?next=/updates/${slug}/edit`);
  if (!hasRole(user, "admin")) return <p className="m-0 text-muted">Only the admin writes updates.</p>;
  const supabase = await createClient();
  const { data: post } = await supabase.from("posts").select("id, slug, title, summary, body, status").eq("slug", slug).maybeSingle();
  if (!post) notFound();
  return <PostEditor post={{ ...post, status: post.status as "draft" | "published" }} userId={user.id} />;
}
