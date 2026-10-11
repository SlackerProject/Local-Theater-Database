import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { AlphaList, ListPage } from "@/components/AlphaList";
import { SHOW_TYPES } from "@/lib/submission";

export const metadata: Metadata = { title: "Shows" };

export default function ShowsPage() {
  return (
    <>
      <SiteHeader />
      <ListPage title="Shows" intro="Every musical, play and opera with a production in the database.">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Shows />
        </Suspense>
      </ListPage>
      <SiteFooter />
    </>
  );
}

async function Shows() {
  const supabase = await createClient();
  const { data } = await supabase.from("shows").select("id, slug, title, type, productions(count)").limit(5000);
  return (
    <AlphaList
      empty="Shows will appear here once productions are added."
      items={(data ?? []).map((s) => {
        const n = s.productions?.[0]?.count ?? 0;
        const type = SHOW_TYPES.find((t) => t.value === s.type)?.label ?? "";
        return {
          key: s.id,
          href: `/show/${s.slug}`,
          label: s.title,
          sortKey: s.title.replace(/^(the|a|an)\s+/i, ""),
          detail: `${type} · ${n} ${n === 1 ? "production" : "productions"}`,
        };
      })}
    />
  );
}
