import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { SettingToggle } from "./SettingToggle";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-8 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Settings</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Settings />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Settings() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/settings");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("notify_updates, show_seen, profile_public").eq("id", user.id).single();

  return (
    <>
      <section className="flex flex-col">
        <h2 className="heading mb-1">Notifications</h2>
        <SettingToggle
          setting="notify_updates"
          initial={profile?.notify_updates ?? true}
          label="Notify me about site updates"
          hint="A notification when we post news about the site, such as a new feature. Never email."
        />
        <p className="m-0 pt-3 text-sm text-muted">
          You’re always notified about people and companies you follow, and changes to your own page. Manage what you follow on{" "}
          <Link href="/following">Shows &amp; follows</Link>.
        </p>
      </section>

      <section className="flex flex-col">
        <h2 className="heading mb-1">Privacy</h2>
        <SettingToggle
          setting="profile_public"
          initial={profile?.profile_public ?? true}
          label="Show my contributor profile"
          hint="Your points, badges and contributions. Turn this off to keep them private; your page on stage stays visible either way."
        />
        <SettingToggle
          setting="show_seen"
          initial={profile?.show_seen ?? false}
          label="Show the shows I’ve seen on my profile"
          hint="Off by default. Going and Want to see are never shown to anyone."
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="heading">Your Account</h2>
        <p className="m-0">
          Signed in as <strong>{user.displayName}</strong> (@{user.username}).{" "}
          <Link href={`/u/${user.username}`}>See your profile</Link>
        </p>
      </section>
    </>
  );
}
