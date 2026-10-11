"use client";

import { useState, useTransition } from "react";
import { setAuditionFollow, setFollow, setWatch } from "@/app/follow-actions";

type Target =
  | { kind: "show"; productionId: string }
  | { kind: "auditions"; productionId: string }
  | { kind: "person"; personId: string }
  | { kind: "company"; organizationId: string };

// "Remove" / "Unfollow" on the Shows & follows page. The row stays (muted,
// with Undo) until the page reloads, so a slip is easy to fix.
export function RemoveButton({ target, label }: { target: Target; label: string }) {
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function run(remove: boolean) {
    setError("");
    start(async () => {
      const path = "/following";
      const r =
        target.kind === "show"
          ? await setWatch(target.productionId, remove ? { status: "none" } : { status: "want_to_see" }, path)
          : target.kind === "auditions"
            ? await setAuditionFollow(target.productionId, !remove, path)
            : await setFollow(
                target.kind === "person" ? { personId: target.personId } : { organizationId: target.organizationId },
                !remove,
                path,
              );
      if (r.ok) setRemoved(remove);
      else setError(r.error);
    });
  }

  return (
    <span className="flex flex-none items-center gap-2">
      {removed ? (
        <>
          <span className="text-sm text-muted">Removed</span>
          <button type="button" disabled={pending} onClick={() => run(false)} className="btn-text text-[15px]">
            Undo
          </button>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => run(true)} className="btn-secondary min-h-11 px-4 text-[15px]">
          {label}
        </button>
      )}
      {error && (
        <span role="alert" className="text-sm font-semibold">
          {error}
        </span>
      )}
    </span>
  );
}
