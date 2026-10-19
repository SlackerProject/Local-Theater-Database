"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replyToFeedback } from "@/app/moderate/actions";
import { answerFeedback, dismissNotification } from "@/app/follow-actions";

export type FeedbackMessage = { id: string; from_moderator: boolean; body: string; created_at: string; author: { display_name: string } | null };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

// The back-and-forth under a piece of feedback. `viewer` says whose side
// we're on: moderators see who replied; the sender sees "Moderator"/"You".
export function FeedbackThread({ messages, viewer }: { messages: FeedbackMessage[]; viewer: "moderator" | "sender" }) {
  if (!messages.length) return null;
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {messages.map((m) => {
        const who = m.from_moderator
          ? viewer === "sender"
            ? "A moderator"
            : (m.author?.display_name ?? "A moderator")
          : viewer === "sender"
            ? "You"
            : "They";
        return (
          <li
            key={m.id}
            className={`flex flex-col gap-0.5 rounded-md px-3 py-2 text-[15px] ${m.from_moderator ? "bg-soft" : "border border-rule"}`}
          >
            <span className="text-sm text-muted">
              <strong className="text-ink">{who}</strong> · {when(m.created_at)}
            </span>
            <span className="whitespace-pre-line">{m.body}</span>
          </li>
        );
      })}
    </ol>
  );
}

// A moderator's reply box (with "Send and mark done"), or the sender's
// answer box (with "Mark read" while the reply is new)
export function FeedbackReplyBox({
  id,
  viewer,
  open = true,
  notificationId,
}: {
  id: string;
  viewer: "moderator" | "sender";
  open?: boolean;
  notificationId?: string;
}) {
  const router = useRouter();
  const boxId = useId();
  const [showing, setShowing] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  const send = (done: boolean) =>
    start(async () => {
      setError("");
      if (!body.trim()) return setError("Write a reply first.");
      const r = viewer === "moderator" ? await replyToFeedback(id, body, done) : await answerFeedback(id, body);
      if (!r.ok) return setError(r.error ?? "That didn’t work.");
      setBody("");
      setShowing(false);
      setSent(true);
      router.refresh();
    });

  const quiet = "inline-flex min-h-10 cursor-pointer items-center rounded-md border border-[#CFCFCF] bg-page px-3 text-sm font-semibold hover:border-ink disabled:opacity-50";

  if (!showing)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setShowing(true)} className={quiet}>
          {viewer === "moderator" ? "Reply" : "Write back"}
        </button>
        {notificationId && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await dismissNotification(notificationId);
                if (r.ok) router.refresh();
              })
            }
            className="btn-text text-[15px]"
          >
            Mark read
          </button>
        )}
        {sent && (
          <span role="status" className="text-sm font-semibold">
            Sent.
          </span>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={boxId} className="text-sm font-semibold">
        {viewer === "moderator" ? "Your reply (they’ll see it in their notifications)" : "Your answer"}
      </label>
      <textarea
        id={boxId}
        rows={3}
        maxLength={2000}
        value={body}
        autoFocus
        onChange={(e) => setBody(e.target.value)}
        className="field w-full p-3 text-[15px]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => send(false)} className="btn-primary min-h-10 px-4 text-sm">
          {pending ? "Sending…" : "Send"}
        </button>
        {viewer === "moderator" && open && (
          <button type="button" disabled={pending} onClick={() => send(true)} className={quiet}>
            Send and mark done
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => setShowing(false)} className="btn-text text-[15px]">
          Cancel
        </button>
        {error && (
          <span role="alert" className="text-sm font-semibold">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
