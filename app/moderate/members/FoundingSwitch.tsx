"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setFoundingOpen } from "../actions";

// Admin only: end the founding-member period at public launch
export function FoundingSwitch({ open, closedAt }: { open: boolean; closedAt: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const run = (next: boolean) =>
    start(async () => {
      setError("");
      const r = await setFoundingOpen(next);
      if (r.ok) {
        setConfirming(false);
        router.refresh();
      } else setError(r.error ?? "That didn’t work.");
    });

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-[#CFCFCF] p-4">
      <h2 className="subheading">Founding members</h2>
      {open ? (
        <>
          <p className="m-0 text-[15px]">
            <strong>Open.</strong> Every account, including new sign-ups, gets the Founding member badge. End it when the site
            launches publicly; accounts made before then keep the badge.
          </p>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px]">New accounts won’t get the badge after this.</span>
              <button type="button" disabled={pending} onClick={() => run(false)} className="btn-primary min-h-10 px-4 text-[15px]">
                End the founding period
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="btn-secondary min-h-10 px-4 text-[15px]">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="btn-secondary min-h-10 self-start px-4 text-[15px]">
              End the founding period…
            </button>
          )}
        </>
      ) : (
        <>
          <p className="m-0 text-[15px]">
            <strong>Ended</strong>
            {closedAt &&
              ` on ${new Date(closedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" })}`}
            . Accounts made before then are founding members.
          </p>
          <button type="button" disabled={pending} onClick={() => run(true)} className="btn-secondary min-h-10 self-start px-4 text-[15px]">
            Reopen it
          </button>
        </>
      )}
      {error && (
        <span role="alert" className="text-sm font-semibold">
          {error}
        </span>
      )}
    </section>
  );
}
