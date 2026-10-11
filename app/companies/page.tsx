import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { AlphaList, ListPage } from "@/components/AlphaList";

export const metadata: Metadata = { title: "Companies" };

export default function CompaniesPage() {
  return (
    <>
      <SiteHeader />
      <ListPage title="Companies" intro="Community theater companies and the towns they call home.">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Companies />
        </Suspense>
      </ListPage>
      <SiteFooter />
    </>
  );
}

async function Companies() {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("id, slug, name, town, state, productions(count)").limit(5000);
  return (
    <AlphaList
      empty="Companies will appear here once productions are added."
      items={(data ?? []).map((o) => {
        const n = o.productions?.[0]?.count ?? 0;
        return {
          key: o.id,
          href: `/company/${o.slug}`,
          label: o.name,
          sortKey: o.name.replace(/^the\s+/i, ""),
          detail: [o.town && `${o.town}, ${o.state}`, `${n} ${n === 1 ? "production" : "productions"}`].filter(Boolean).join(" · "),
        };
      })}
    />
  );
}
