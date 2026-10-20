import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ModerationNav } from "../ModerationNav";
import { StatsView, type StatsData } from "./StatsView";

export const metadata: Metadata = { title: "Stats · Moderation" };

export default function StatsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Moderation</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <ModerationNav current="/moderate/stats" />
          <Stats />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

// Moderation → Stats: the database and the site at a glance, for the
// moderation and leadership team (moderation_stats() checks the role too)
async function Stats() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/moderate/stats");
  if (!hasRole(user, "moderator")) return <p className="text-muted">Only moderators and the admin can see stats.</p>;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("moderation_stats");
  if (error || !data) return <p className="callout m-0">Couldn’t load the stats: {error?.message}</p>;
  return <StatsView s={data as unknown as StatsData} />;
}
