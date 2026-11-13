"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { undoBulk } from "./actions";

// "Undo" on a recent upload: removes the productions it added
export function UndoUploadButton({ id, count }: { id: string; count: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Remove the ${count} ${count === 1 ? "production" : "productions"} this upload added? Replaced productions keep the file’s cast and crew.`)) return;
          start(async () => {
            const r = await undoBulk(id);
            if (r.ok) router.refresh();
            else setError(r.error);
          });
        }}
        className="btn-secondary min-h-10 px-4 text-sm"
      >
        {pending ? "Undoing…" : "Undo"}
      </button>
      {error && (
        <span role="alert" className="text-sm font-semibold text-alert">
          {error}
        </span>
      )}
    </span>
  );
}
