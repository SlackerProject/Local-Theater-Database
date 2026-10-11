import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, type Role } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ModerationNav } from "../ModerationNav";
import { MemberActions } from "./MemberActions";

export const metadata: Metadata = { title: "Members · Moderation · Local Theater Database" };

export default function MembersPage({ searchParams }: PageProps<"/moderate/members">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Moderation</h1>
        <ModerationNav current="/moderate/members" />
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Members searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const ROLE_LABEL: Record<Role, string> = { member: "Member", trusted: "Trusted editor", moderator: "Moderator", admin: "Admin" };
const ORDER: Role[] = ["member", "trusted", "moderator", "admin"];
const cell = "border-b border-[#CFCFCF] p-3 align-top text-left";
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : "—";

async function Members({ searchParams }: Pick<PageProps<"/moderate/members">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/moderate/members");
  if (!hasRole(user, "moderator")) return <p className="text-muted">Only moderators and the admin can see the member list.</p>;

  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const supabase = await createClient();
  const { data: members, error } = await supabase.rpc("member_overview", { p_query: query });
  const isAdmin = hasRole(user, "admin");

  return (
    <>
      <p className="m-0 max-w-[760px] text-[15px] text-muted">
        Everyone with an account, most recently active first.{" "}
        {isAdmin ? "As the admin, you can change roles. " : ""}Moderators can suspend accounts below their own role; a
        suspended account can’t submit, upload or claim a page.
      </p>
      <form action="/moderate/members" role="search" className="flex flex-wrap items-center gap-2">
        <label htmlFor="member-q" className="sr-only">
          Search members
        </label>
        <input id="member-q" name="q" defaultValue={query} placeholder="Search by name or username" className="field h-11 w-full max-w-[360px] px-3" />
        <button type="submit" className="btn-secondary min-h-11">
          Search
        </button>
        {query && (
          <Link href="/moderate/members" className="font-semibold">
            Clear
          </Link>
        )}
      </form>
      {error && <p className="callout m-0">Couldn’t load members: {error.message}</p>}
      {!members?.length && !error && <p className="m-0 text-muted">No members match.</p>}

      {!!members?.length && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse border border-[#CFCFCF] text-[15px]">
            <thead>
              <tr className="bg-soft">
                <th scope="col" className={cell}>Member</th>
                <th scope="col" className={cell}>Role</th>
                <th scope="col" className={cell}>Activity</th>
                <th scope="col" className={cell}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const below = ORDER.indexOf(m.role) < ORDER.indexOf(user.role);
                const self = m.id === user.id;
                return (
                  <tr key={m.id} className={m.banned_at ? "bg-[#FFF0F0]" : ""}>
                    <td className={cell}>
                      <span className="block font-bold">{m.display_name}</span>
                      <span className="block text-sm text-muted">@{m.username} · joined {day(m.joined)}</span>
                      {m.banned_at && (
                        <span className="mt-1 block text-sm font-semibold">
                          Suspended {day(m.banned_at)}
                          {m.banned_reason && `: “${m.banned_reason}”`}
                        </span>
                      )}
                    </td>
                    <td className={cell}>{ROLE_LABEL[m.role]}</td>
                    <td className={cell}>
                      <span className="block">
                        {m.approved} approved · {m.rejected} rejected · <strong>{m.pending} waiting</strong>
                      </span>
                      <span className="block text-sm text-muted">
                        {m.uploads} uploads · last active {day(m.last_active)}
                      </span>
                      <Link href={`/moderate/changes?user=${m.id}`} className="text-sm font-semibold">
                        See their changes
                      </Link>
                    </td>
                    <td className={cell}>
                      {self ? (
                        <span className="text-sm text-muted">This is you</span>
                      ) : (
                        <MemberActions
                          userId={m.id}
                          name={m.display_name}
                          role={m.role}
                          suspended={!!m.banned_at}
                          canSetRole={isAdmin && m.role !== "admin"}
                          canSuspend={below}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
