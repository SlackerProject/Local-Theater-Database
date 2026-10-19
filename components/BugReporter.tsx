"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FEEDBACK_KINDS, feedbackKind, type FeedbackKind } from "@/lib/feedback";
// Supabase loads only when needed, so it isn't part of every page's download
const loadSupabase = () => import("@/lib/supabase/client").then((m) => m.createClient());

// "Give feedback" in the footer: a bug, an idea, wrong information or
// anything else. It carries the page address, the browser and window size,
// and the last few errors the page hit, so a moderator can copy a bug
// straight into a request for a fix.

const recentErrors: string[] = [];
let listening = false;

function remember(text: string) {
  const t = text.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!t || recentErrors.includes(t)) return;
  recentErrors.push(t);
  if (recentErrors.length > 5) recentErrors.shift();
}

// Start collecting page errors once, for the life of the tab
function listenForErrors() {
  if (listening) return;
  listening = true;
  window.addEventListener("error", (e) => remember(`${e.message}${e.filename ? ` (${e.filename.split("/").pop()}:${e.lineno})` : ""}`));
  window.addEventListener("unhandledrejection", (e) => remember(`Unhandled: ${String((e.reason as Error)?.message ?? e.reason)}`));
  const original = console.error;
  console.error = (...args: unknown[]) => {
    remember(args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : "")).join(" "));
    original(...args);
  };
}

export function BugReporter() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [trap, setTrap] = useState(""); // a hidden field only bots fill in
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const ids = { msg: useId(), title: useId() };

  useEffect(listenForErrors, []);

  function open() {
    setState("idle");
    setError("");
    dialog.current?.showModal();
  }

  async function send() {
    if (trap) return setState("sent");
    if (message.trim().length < 5) return setError("Please write a few words.");
    setState("sending");
    setError("");
    const details = {
      browser: navigator.userAgent,
      window: `${window.innerWidth}×${window.innerHeight}`,
      screen: `${screen.width}×${screen.height}`,
      language: navigator.language,
      came_from: document.referrer || null,
      local_time: new Date().toString(),
      errors: [...recentErrors],
    };
    const { error: e } = await (await loadSupabase()).rpc("send_feedback", {
      p_kind: kind,
      p_page_url: window.location.href,
      p_message: message,
      p_details: details,
    });
    if (e) {
      setState("idle");
      setError(e.message);
    } else {
      setState("sent");
      setMessage("");
    }
  }

  return (
    <>
      <button type="button" onClick={open} className="link-quiet cursor-pointer border-0 bg-transparent p-0 text-sm text-muted underline-offset-[3px] hover:underline">
        Give feedback
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={ids.title}
        className="m-auto w-[min(520px,calc(100vw-32px))] rounded-lg border border-rule p-0 text-ink shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop:bg-black/40"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      >
        <div className="flex flex-col gap-3 p-5">
          <h2 id={ids.title} className="subheading">
            Give feedback
          </h2>
          {state === "sent" ? (
            <>
              <p role="status" className="m-0">
                Thanks! The moderators have your feedback.
              </p>
              <button type="button" onClick={() => dialog.current?.close()} className="btn-primary self-start">
                Close
              </button>
            </>
          ) : (
            <>
              <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
                <legend className="mb-1 text-[15px] font-semibold">What is it about?</legend>
                {FEEDBACK_KINDS.map((k) => (
                  <label key={k.value} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[15px]">
                    <input
                      type="radio"
                      name={`${ids.msg}-kind`}
                      value={k.value}
                      checked={kind === k.value}
                      onChange={() => setKind(k.value)}
                      className="h-5 w-5 flex-none accent-ink"
                    />
                    {k.label}
                  </label>
                ))}
              </fieldset>
              <label htmlFor={ids.msg} className="text-[15px] font-semibold">
                {feedbackKind(kind).prompt} <span className="font-normal text-muted">{feedbackKind(kind).hint}</span>
              </label>
              <textarea
                id={ids.msg}
                rows={4}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={feedbackKind(kind).placeholder}
                className="field w-full p-3"
              />
              <input
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={trap}
                onChange={(e) => setTrap(e.target.value)}
                className="absolute left-[-9999px] h-px w-px"
                name="website"
              />
              <p className="m-0 text-sm text-muted">
                This page’s address and your browser type are sent with it, to help us follow up. If you’re signed in, a
                moderator can reply to you in your notifications.
              </p>
              {error && (
                <p role="alert" className="m-0 font-semibold">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" disabled={state === "sending"} onClick={send} className="btn-primary">
                  {state === "sending" ? "Sending…" : "Send feedback"}
                </button>
                <button type="button" onClick={() => dialog.current?.close()} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
