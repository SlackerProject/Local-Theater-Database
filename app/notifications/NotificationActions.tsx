"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { keepAll, respond } from "./actions";

export function NotificationActions({ id, status }: { id: string; status: "unread" | "kept" | "disputed" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [disputing, setDisputing] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();

  const send = (keep: boolean) =>
    start(async () => {
      setError(null);
      const r = await respond(id, keep, note);
      if (r.ok) {
        setDisputing(false);
        router.refresh();
      } else setError(r.error ?? "That didn’t work.");
    });

  if (disputing)
    return (
      <div className="flex w-full flex-col gap-2">
        <label htmlFor={noteId} className="text-[15px] font-semibold">
          What’s wrong with this change? <span className="font-normal text-muted">(optional, for the moderator)</span>
        </label>
        <textarea id={noteId} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="field max-w-[520px] p-3" />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={pending} onClick={() => send(false)}>
            Send dispute
          </button>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => setDisputing(false)}>
            Cancel
          </button>
        </div>
        {error && <p role="alert" className="callout m-0 text-[15px]">{error}</p>}
      </div>
    );

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "kept" && (
        <button type="button" className="btn-primary" disabled={pending} onClick={() => send(true)}>
          Keep it
        </button>
      )}
      {status !== "disputed" && (
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => setDisputing(true)}>
          Dispute
        </button>
      )}
      {error && <p role="alert" className="callout m-0 w-full text-[15px]">{error}</p>}
    </div>
  );
}

export function KeepAllButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await keepAll();
          router.refresh();
        })
      }
    >
      Keep all {count}
    </button>
  );
}
