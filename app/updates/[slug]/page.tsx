import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { POST_BODY, renderPost } from "@/lib/markdown";
import { postDate } from "@/lib/updates";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ReadMarker } from "./ReadMarker";

export async function generateMetadata({ params }: PageProps<"/updates/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase.from("posts").select("title, summary").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!post) return { title: "Updates" };
  return { title: post.title, description: post.summary || undefined, openGraph: { title: post.title, description: post.summary || undefined, type: "article" } };
}

export default function PostPage({ params }: PageProps<"/updates/[slug]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[740px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Post params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Post({ params }: Pick<PageProps<"/updates/[slug]">, "params">) {
  const { slug } = await params;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data: post } = await supabase.from("posts").select("id, slug, title, summary, body, status, published_at").eq("slug", slug).maybeSingle();
  if (!post) notFound();
  const isAdmin = hasRole(user, "moderator");

  return (
    <article className="flex max-w-[680px] flex-col gap-6">
      {post.status === "draft" && (
        <p className="callout m-0">
          <strong>Draft.</strong> Only you can see this until it’s published.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Link href="/updates" className="self-start text-sm font-semibold text-muted">
          Updates
        </Link>
        <h1 className="m-0 text-[34px] font-extrabold leading-[1.1] tracking-[-0.02em] md:text-[44px]">{post.title}</h1>
        <span className="text-muted">{post.status === "published" ? postDate(post.published_at) : "Not published yet"}</span>
        {isAdmin && (
          <Link href={`/updates/${post.slug}/edit`} className="btn-secondary min-h-10 self-start px-4 text-sm">
            Edit this update
          </Link>
        )}
      </div>
      <div className={POST_BODY}>{renderPost(post.body)}</div>
      {user && post.status === "published" && <ReadMarker postId={post.id} />}
    </article>
  );
}
