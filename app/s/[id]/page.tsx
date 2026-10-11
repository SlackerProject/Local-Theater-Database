import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

// Share links from "Share with your cast": forward to the production page
// once it's approved; until then, explain what's happening.
export default function SharePage({ params }: PageProps<"/s/[id]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-5 px-4 pb-16 pt-10 md:px-8 md:pt-16">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Destination params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Destination({ params }: Pick<PageProps<"/s/[id]">, "params">) {
  const { id } = await params;
  const valid = /^[0-9a-f-]{36}$/i.test(id);
  const supabase = await createClient();
  const { data } = valid ? await supabase.rpc("submission_destination", { p_proposal_id: id }) : { data: null };
  const dest = data?.[0];

  if (dest?.slug) redirect(`/production/${dest.slug}`);

  if (!dest || dest.status === "rejected") {
    return (
      <>
        <h1 className="display text-[40px] md:text-[56px]">This link isn’t active</h1>
        <p className="m-0 text-muted">
          The production it points to isn’t on the site. Try <Link href="/search">searching</Link> for it instead.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="display text-[40px] md:text-[56px]">{dest.title} is on its way</h1>
      <p className="m-0 text-lg">
        A castmate added this production, and a moderator is checking it now. Once it’s approved, this same link will take
        you straight to the production page.
      </p>
      <p className="m-0 text-muted">
        When it’s live, find your name in the cast, click it, and choose “Is this you?” to claim your page. You’ll be able to
        add a headshot, write a bio and keep your credits up to date.
      </p>
      <div className="flex flex-wrap gap-2.5">
        <Link href="/signup" className="btn-primary">
          Create an account
        </Link>
        <Link href="/" className="btn-secondary">
          Explore the site
        </Link>
      </div>
    </>
  );
}
