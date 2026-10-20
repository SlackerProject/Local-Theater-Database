"use client";

import { useState, useTransition } from "react";
import { setHomeCounts } from "../actions";

// Admin only: show the "and counting" numbers on the home page
export function HomeCountsSwitch({ initial, preview }: { initial: boolean; preview: string }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-[#CFCFCF] p-4">
      <h2 className="subheading">Home Page Numbers</h2>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            setError("");
            start(async () => {
              const r = await setHomeCounts(next);
              if (!r.ok) {
                setOn(!next);
                setError(r.error ?? "That didn’t save.");
              }
            });
          }}
          className="mt-0.5 h-5 w-5 flex-none accent-ink"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">Show the “and counting” line on the home page</span>
          <span className="text-sm text-muted">It would read: {preview}</span>
        </span>
      </label>
      {error && (
        <span role="alert" className="text-sm font-semibold">
          {error}
        </span>
      )}
    </section>
  );
}
