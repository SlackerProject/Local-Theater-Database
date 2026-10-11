"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveDispute, resolveSuggestion, reviewAuditions, reviewClaim, reviewSuggestion, vouchForClaim } from "./actions";
import { reviewAward } from "../awards/actions";

type Done = { ok: boolean; error?: string };

// A row of buttons that each run one review action, then refresh the queue
function ActionRow({ buttons }: { buttons: { label: string; primary?: boolean; disabled?: string; run: () => Promise<Done> }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.disabled}
            className={b.primary ? "btn-primary" : "btn-secondary"}
            disabled={pending || !!b.disabled}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await b.run();
                if (r.ok) router.refresh();
                else setError(r.error ?? "That didn’t work.");
              })
            }
          >
            {b.label}
          </button>
        ))}
      </div>
      {buttons.filter((b) => b.disabled).map((b) => (
        <span key={b.label} className="text-sm text-muted">
          {b.disabled}
        </span>
      ))}
      {error && (
        <p role="alert" className="callout m-0 text-[15px]">
          {error}
        </p>
      )}
    </div>
  );
}

export function ClaimButtons({
  id,
  canVerify,
  ownClaim,
  isAdmin,
  canVouch,
  vouched,
}: {
  id: string;
  canVerify: boolean;
  ownClaim: boolean;
  isAdmin: boolean;
  canVouch: boolean;
  vouched: boolean;
}) {
  const buttons = [];
  if (canVerify) {
    const selfBlocked = ownClaim && !isAdmin ? "This is your own claim. Another moderator needs to verify it." : undefined;
    buttons.push({ label: "Verify", primary: true, disabled: selfBlocked, run: () => reviewClaim(id, true) });
    buttons.push({ label: "Reject", run: () => reviewClaim(id, false) });
  }
  if (canVouch && !vouched && !ownClaim) buttons.push({ label: "I know this person", run: () => vouchForClaim(id) });
  if (!buttons.length) return null;
  return <ActionRow buttons={buttons} />;
}

export function DisputeButtons({ id, canUndo }: { id: string; canUndo: boolean }) {
  return (
    <ActionRow
      buttons={[
        ...(canUndo ? [{ label: "Undo the change", primary: true, run: () => resolveDispute(id, true) }] : []),
        { label: canUndo ? "Keep the change" : "Mark resolved", run: () => resolveDispute(id, false) },
      ]}
    />
  );
}

export function AwardButtons({ id }: { id: string }) {
  return (
    <ActionRow
      buttons={[
        { label: "Approve", primary: true, run: () => reviewAward(id, true) },
        { label: "Reject", run: () => reviewAward(id, false) },
      ]}
    />
  );
}

export function PageSuggestionButtons({ id }: { id: string }) {
  return (
    <ActionRow
      buttons={[
        { label: "Mark done", primary: true, run: () => resolveSuggestion(id, true) },
        { label: "Dismiss", run: () => resolveSuggestion(id, false) },
      ]}
    />
  );
}

export function AuditionButtons({ id }: { id: string }) {
  return (
    <ActionRow
      buttons={[
        { label: "Publish", primary: true, run: () => reviewAuditions(id, true) },
        { label: "Reject", run: () => reviewAuditions(id, false) },
      ]}
    />
  );
}

export function SuggestionButtons({ id, hasNameChange }: { id: string; hasNameChange: boolean }) {
  return (
    <ActionRow
      buttons={[
        { label: hasNameChange ? "Approve the new name" : "Mark done", primary: true, run: () => reviewSuggestion(id, true) },
        { label: "Reject", run: () => reviewSuggestion(id, false) },
      ]}
    />
  );
}
