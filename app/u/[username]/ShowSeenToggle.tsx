"use client";

import { useState, useTransition } from "react";
import { setShowSeen } from "../actions";

// The owner's switch: share Shows seen on the profile, or keep it private
export function ShowSeenToggle({ initial, username }: { initial: boolean; username: string }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <label className="flex cursor-pointer items-center gap-2.5 text-[15px] font-semibold">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            setError("");
            start(async () => {
              const r = await setShowSeen(next, username);
              if (!r.ok) {
                setOn(!next);
                setError(r.error ?? "That didn’t work.");
              }
            });
          }}
          className="h-5 w-5 accent-ink"
        />
        Show the shows I’ve seen on my profile
      </label>
      <span className="text-sm text-muted">
        {on ? "Visitors can see your Shows seen count and posters." : "Only you can see this section."} Going and Want to see are never shown.
      </span>
      {error && (
        <span role="alert" className="text-sm font-semibold">
          {error}
        </span>
      )}
    </div>
  );
}
