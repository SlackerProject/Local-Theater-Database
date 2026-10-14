"use client";

import { useEffect } from "react";
// Supabase loads only when needed, so it isn't part of every page's download
const loadSupabase = () => import("@/lib/supabase/client").then((m) => m.createClient());

// Counts a visit for the Hotlist without storing anything personal: the
// browser keeps a random id of its own, and only a one-way SHA-256 of that
// id plus today's date is sent, so visits can't be linked across days.
// The database keeps one row per visitor, page and day.
const KEY = "ltdb-visitor";

async function visitorHash() {
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
  } catch {
    return null; // storage blocked: don't count rather than count twice
  }
  const day = new Date().toISOString().slice(0, 10);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${id}:${day}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function ViewTracker({ table, id }: { table: "people" | "productions" | "shows"; id: string }) {
  useEffect(() => {
    let cancelled = false;
    visitorHash().then((hash) => {
      if (!hash || cancelled) return;
      // The request is only sent once it's awaited (then)
      loadSupabase().then((supabase) =>
        supabase.rpc("record_view", { p_table: table, p_id: id, p_visitor_hash: hash }).then(() => undefined),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [table, id]);
  return null;
}
