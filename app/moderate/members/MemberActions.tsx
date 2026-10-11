"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreMember, setMemberRole, suspendMember } from "../actions";

type Role = "member" | "trusted" | "moderator" | "admin";

const ROLE_HELP: Record<Exclude<Role, "admin">, string> = {
  member: "Can submit; everything is reviewed",
  trusted: "Can vouch for claims and publish audition dates",
  moderator: "Can review, edit directly, delete and suspend",
};

const small = "inline-flex min-h-10 cursor-pointer items-center rounded-md border border-[#CFCFCF] bg-page px-3 text-sm font-semibold hover:border-ink disabled:opacity-50";

// Role and suspension controls for one member row
export function MemberActions({
  userId,
  name,
  role,
  suspended,
  canSetRole,
  canSuspend,
}: {
  userId: string;
  name: string;
  role: Role;
  suspended: boolean;
  canSetRole: boolean;
  canSuspend: boolean;
}) {
  const router = useRouter();
  const [nextRole, setNextRole] = useState<Exclude<Role, "admin">>(role === "admin" ? "moderator" : role);
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; rejected?: number }>, done: (r: { rejected?: number }) => string) =>
    start(async () => {
      setError("");
      setMessage("");
      const r = await fn();
      if (r.ok) {
        setMessage(done(r));
        setSuspending(false);
        router.refresh();
      } else setError(r.error ?? "That didn’t work.");
    });

  return (
    <div className="flex flex-col gap-2">
      {canSetRole && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`role-${userId}`}>
            Role for {name}
          </label>
          <select
            id={`role-${userId}`}
            value={nextRole}
            onChange={(e) => setNextRole(e.target.value as Exclude<Role, "admin">)}
            className="field h-10 px-2 text-[15px]"
          >
            {(["member", "trusted", "moderator"] as const).map((r) => (
              <option key={r} value={r}>
                {r === "trusted" ? "Trusted editor" : r[0].toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || nextRole === role}
            onClick={() => run(() => setMemberRole(userId, nextRole), () => `${name} is now ${nextRole === "trusted" ? "a trusted editor" : `a ${nextRole}`}.`)}
            className={small}
          >
            Save role
          </button>
          <span className="w-full text-xs text-muted">{ROLE_HELP[nextRole]}</span>
        </div>
      )}

      {canSuspend &&
        (suspended ? (
          <button type="button" disabled={pending} onClick={() => run(() => restoreMember(userId), () => `${name} can contribute again.`)} className={`${small} self-start`}>
            Restore account
          </button>
        ) : suspending ? (
          <div className="flex flex-col gap-2 border border-[#CFCFCF] p-2.5">
            <label htmlFor={`reason-${userId}`} className="text-sm font-semibold">
              Reason <span className="font-normal text-muted">(for the moderators’ records)</span>
            </label>
            <input id={`reason-${userId}`} value={reason} onChange={(e) => setReason(e.target.value)} className="field h-10 px-2 text-[15px]" />
            <span className="text-sm">
              {name} won’t be able to submit, upload or claim a page, and everything they have waiting will be rejected.
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => suspendMember(userId, reason),
                    (r) => `${name} is suspended.${r.rejected ? ` ${r.rejected} waiting ${r.rejected === 1 ? "item was" : "items were"} rejected.` : ""}`,
                  )
                }
                className="btn-primary min-h-10 px-3 text-sm"
              >
                Suspend {name}
              </button>
              <button type="button" onClick={() => setSuspending(false)} className={small}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setSuspending(true)} className={`${small} self-start`}>
            Suspend…
          </button>
        ))}

      {message && (
        <span role="status" className="text-sm font-semibold">
          {message}
        </span>
      )}
      {error && (
        <span role="alert" className="text-sm font-semibold">
          {error}
        </span>
      )}
    </div>
  );
}
