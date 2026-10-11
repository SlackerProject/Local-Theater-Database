"use client";

import { useId, useState } from "react";

// "Share with your cast": a link that works before and after approval
// (/s/<submission id> forwards to the production page once it's live),
// plus a short invitation to claim their pages.
// Only rendered in the browser after a submission, so window is available
export function ShareWithCast({ submissionId, title }: { submissionId: string; title: string }) {
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const textId = useId();
  const origin = window.location.origin;
  const canShare = typeof navigator.share === "function";

  const url = `${origin}/s/${submissionId}`;
  const message = `${title} is on Local Theater Database! Find your name in the cast, click it, and choose “Is this you?” to claim your page, add a headshot and keep your credits up to date: ${url}`;

  async function copy(what: "link" | "message") {
    try {
      await navigator.clipboard.writeText(what === "link" ? url : message);
      setCopied(what);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      // Clipboard blocked: the text is selectable in the box below
    }
  }

  return (
    <section aria-labelledby="share-title" className="flex flex-col gap-3 border-t border-rule pt-5">
      <h2 id="share-title" className="heading">
        Share with your cast
      </h2>
      <p className="m-0 text-muted">
        Send this to your castmates and crew so they can claim their pages. Until a moderator approves the production, the
        link explains it’s on its way.
      </p>
      <label htmlFor={textId} className="sr-only">
        Message to share
      </label>
      <textarea id={textId} readOnly rows={4} value={message} onFocus={(e) => e.target.select()} className="field max-w-[620px] p-3 text-[15px]" />
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className="btn-primary" onClick={() => copy("message")}>
          {copied === "message" ? "Copied!" : "Copy message"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => copy("link")}>
          {copied === "link" ? "Copied!" : "Copy link only"}
        </button>
        {canShare && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigator.share({ title, text: message }).catch(() => undefined)}
          >
            Share…
          </button>
        )}
      </div>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to the clipboard" : ""}
      </span>
    </section>
  );
}
