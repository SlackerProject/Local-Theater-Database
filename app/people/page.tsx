import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { AlphaList, ListPage } from "@/components/AlphaList";

export const metadata: Metadata = { title: "People · Local Theater Database" };

export default function PeoplePage() {
  return (
    <>
      <SiteHeader />
      <ListPage title="People" intro="Everyone credited on stage or behind the scenes, by last name.">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <People />
        </Suspense>
      </ListPage>
      <SiteFooter />
    </>
  );
}

async function People() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("id, slug, display_name, sort_name, credits(count)")
    .eq("is_hidden", false)
    .limit(5000);
  return (
    <AlphaList
      empty="People will appear here once productions are added."
      items={(data ?? []).map((p) => {
        const n = p.credits?.[0]?.count ?? 0;
        return {
          key: p.id,
          href: `/person/${p.slug}`,
          label: p.display_name,
          sortKey: p.sort_name,
          detail: `${n} ${n === 1 ? "credit" : "credits"}`,
        };
      })}
    />
  );
}
