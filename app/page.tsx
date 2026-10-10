import { Suspense } from "react";
import { io } from "next/cache";
import { getSupabase } from "@/lib/supabase";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg border border-rule bg-surface">
        <div className="h-2 bg-marquee" />
        <div className="px-6 py-10 sm:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Local Theater Database
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">
            Every local stage, every show.
          </h1>
          <hr className="my-8 border-rule" />
          <Suspense fallback={<p className="text-muted">Checking the database…</p>}>
            <ShowCount />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function ShowCount() {
  await io(); // count fresh on every visit, not once at build time

  const supabase = getSupabase();
  if (!supabase) {
    return (
      <p className="text-muted">
        Not connected yet: the Supabase settings are missing.
      </p>
    );
  }

  const { count, error } = await supabase
    .from("shows")
    .select("*", { count: "exact", head: true });

  if (error) {
    return (
      <p className="text-accent">
        Couldn&apos;t reach the database: {error.message}
      </p>
    );
  }

  const shows = count ?? 0;
  return (
    <p className="text-lg">
      <span className="font-serif text-5xl text-accent">{shows}</span>{" "}
      <span className="text-muted">
        {shows === 1 ? "show" : "shows"} in the database
      </span>
    </p>
  );
}
