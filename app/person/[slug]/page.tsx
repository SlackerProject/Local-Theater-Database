import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { showColors, swatch } from "@/lib/palette";
import { getCurrentUser } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PosterTile } from "@/components/PosterTile";
import { FollowButton } from "@/components/FollowButton";
import { ModeratorDeleteSection } from "@/components/ModeratorDeleteSection";
import { EditButton, SuggestEdit } from "@/components/SuggestEdit";
import { ContributorMedal, pointsFor } from "@/components/badges/ContributorMedal";
import { ViewTracker } from "@/components/ViewTracker";
import { AWARD_SELECT, awardSentence, productionTitle, sortAwards, type AwardRow } from "@/lib/awards";
import { HeadshotUploader } from "@/components/uploads/UploadPanels";
import type { PageLink } from "./actions";
import {
  AddCreditForm,
  BioLinksEditor,
  ClaimPanel,
  EditableRole,
  HeadshotChooser,
  HideCreditToggle,
  HidePageButton,
  RestorePageButton,
  SuggestCorrection,
} from "./OwnerControls";

export default function PersonPage({ params, searchParams }: PageProps<"/person/[slug]">) {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<p className="mx-auto w-full max-w-[1180px] px-4 py-12 text-muted md:px-8">Loading…</p>}>
        <Person params={params} searchParams={searchParams} />
      </Suspense>
      <SiteFooter />
    </>
  );
}

function asLinks(value: unknown): PageLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((l): l is { label?: unknown; url?: unknown } => !!l && typeof l === "object")
    .map((l) => ({ label: typeof l.label === "string" ? l.label : "", url: typeof l.url === "string" ? l.url : "" }))
    .filter((l) => /^https?:\/\//i.test(l.url));
}

function VerifiedMark() {
  return (
    <span title="Verified by the performer" className="inline-flex items-center gap-1 font-semibold text-ink">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#141414" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M8 12.3l2.6 2.5L16 9.5" />
      </svg>
      Verified
    </span>
  );
}

async function Person({ params, searchParams }: Pick<PageProps<"/person/[slug]">, "params" | "searchParams">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select(
      `id, slug, display_name, bio, links, is_hidden, verified_owner_id,
       headshot:media!people_headshot_fk(id, thumb_key, storage_key, photographer_credit),
       credits(id, kind, role_name, hidden_on_person_page, added_by_owner,
               character:show_characters(name),
               production:productions(id, slug, year, title_override, opening_date,
                                      color_ground, color_ground_2, color_ink, color_soft, color_accent, color_edge,
                                      poster:media!productions_poster_fk(thumb_key),
                                      show:shows(title),
                                      organization:organizations(slug, name),
                                      location:locations(slug, name)))`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!person) notFound();

  const user = await getCurrentUser();
  const isOwner = !!user && person.verified_owner_id === user.id;
  const editing = isOwner && query.view !== "visitor"; // "See it as visitors do" turns the controls off
  const pagePath = `/person/${person.slug}`;

  const [
    { data: collaborators },
    { data: owner },
    { data: claimState },
    { data: myClaim },
    { data: myUploads },
    { data: headshots },
    { count: unread },
    { data: followers },
    { data: myFollow },
    { data: seen },
  ] = await Promise.all([
      supabase.rpc("frequent_collaborators", { p_person_id: person.id }),
      person.verified_owner_id
        ? supabase.from("profiles").select("display_name, username").eq("id", person.verified_owner_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.rpc("claim_state", { p_person_id: person.id }),
      user
        ? supabase.from("person_claims").select("id, status").eq("person_id", person.id).eq("user_id", user.id).eq("status", "pending").maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase.from("media").select("id").eq("person_id", person.id).eq("uploaded_by", user.id).eq("status", "pending")
        : Promise.resolve({ data: [] }),
      isOwner
        ? supabase.from("media").select("id, thumb_key, storage_key").eq("person_id", person.id).eq("kind", "headshot").eq("status", "approved").order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      isOwner
        ? supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("kind", "page_changed").eq("status", "unread")
        : Promise.resolve({ count: 0 }),
      supabase.rpc("follower_count", { p_person_id: person.id }),
      user && !isOwner
        ? supabase.from("follows").select("id").eq("user_id", user.id).eq("person_id", person.id).maybeSingle()
        : Promise.resolve({ data: null }),
      person.verified_owner_id ? supabase.rpc("seen_count", { p_person_id: person.id }) : Promise.resolve({ data: 0 }),
    ]);

  const { data: awardRows } = await supabase.from("award_entries").select(AWARD_SELECT).eq("person_id", person.id);
  const awards = sortAwards((awardRows ?? []) as unknown as AwardRow[]);
  const ownerPoints = person.verified_owner_id ? (await pointsFor([person.verified_owner_id])).get(person.verified_owner_id) : undefined;
  const headshot = person.headshot;
  const pendingHeadshots = myUploads?.length ?? 0;
  const links = asLinks(person.links);

  // Credits, newest first. Visitors don't see hidden ones; the owner sees
  // them marked, with controls.
  const allCredits = (person.credits ?? [])
    .filter((c) => c.production?.show)
    .map((c) => ({
      ...c,
      prod: c.production!,
      title: c.production!.title_override ?? c.production!.show!.title,
      role: c.character?.name ?? c.role_name ?? "",
    }))
    .sort((a, b) => b.prod.year - a.prod.year || (b.prod.opening_date ?? "").localeCompare(a.prod.opening_date ?? ""));
  const visible = allCredits.filter((c) => !c.hidden_on_person_page);
  const listed = editing ? allCredits : visible;

  // On stage: one tile per production, with every role they had in it
  const shelf = new Map<string, { prod: (typeof visible)[number]["prod"]; title: string; roles: string[] }>();
  for (const c of visible) {
    const entry = shelf.get(c.prod.id) ?? { prod: c.prod, title: c.title, roles: [] };
    if (c.role && !entry.roles.includes(c.role)) entry.roles.push(c.role);
    shelf.set(c.prod.id, entry);
  }

  const crewRoles = [...new Set(visible.filter((c) => c.kind === "crew").map((c) => c.role).filter(Boolean))];
  const descriptor = [
    visible.some((c) => c.kind === "cast") && "Actor",
    ...crewRoles.slice(0, 2),
    `${visible.length} ${visible.length === 1 ? "credit" : "credits"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* The owner's quiet notice bar */}
      {isOwner && (
        <div className="border-b border-rule bg-soft">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-x-4 px-4 md:px-8">
            <span className="py-2.5 text-[15px] font-semibold">
              {editing ? "You’re viewing your own page" : "You’re seeing your page as visitors do"}
            </span>
            <Link href={editing ? `${pagePath}?view=visitor` : pagePath} className="inline-flex min-h-11 items-center text-[15px] font-semibold">
              {editing ? "See it as visitors do" : "Back to your controls"}
            </Link>
          </div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-12 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        {isOwner && person.is_hidden && (
          <section className="callout flex flex-col gap-3">
            <strong>Your page is hidden from visitors.</strong>
            <span className="text-[15px]">Only you and moderators can see it. Restore it to show it again.</span>
            <RestorePageButton slug={person.slug} />
          </section>
        )}

        {editing && (unread ?? 0) > 0 && (
          <section className="callout flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
            <span>
              <strong>
                {unread} {unread === 1 ? "change" : "changes"} to your page.
              </strong>{" "}
              <span className="text-muted">Someone else edited your page or credits. Keep each change or dispute it.</span>
            </span>
            <Link href="/notifications" className="btn-primary">
              Review
            </Link>
          </section>
        )}

        {/* Claiming */}
        {!person.verified_owner_id &&
          (myClaim ? (
            <section className="callout flex flex-col gap-2">
              <strong>Claim pending</strong>
              <span className="text-[15px]">
                A moderator is checking your claim. Once it’s verified you’ll be able to edit this page. Meanwhile you can
                suggest corrections, which go through the usual review.
              </span>
              <SuggestCorrection personId={person.id} slug={person.slug} currentName={person.display_name} label="Suggest a correction" />
            </section>
          ) : claimState === "pending" ? (
            <p className="m-0 border-y border-rule py-4 text-[15px] text-muted">Someone has claimed this page. A moderator is reviewing it.</p>
          ) : user ? (
            <ClaimPanel personId={person.id} slug={person.slug} name={person.display_name} />
          ) : (
            <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-rule py-5">
              <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-0.5">
                <span className="text-xl font-extrabold">Is this you?</span>
                <span className="text-muted">Claim this page to choose your headshot, write a bio, and keep your credits up to date.</span>
              </div>
              <Link href={`/signin?next=${encodeURIComponent(pagePath)}`} className="btn-primary">
                Sign in to claim this page
              </Link>
            </section>
          ))}

        <section className="flex flex-wrap items-end gap-9">
          <div className="flex w-[140px] flex-none flex-col gap-1 md:w-[180px]">
            {headshot ? (
              <img
                src={mediaUrl(headshot.thumb_key ?? headshot.storage_key)!}
                alt={`${person.display_name}, headshot`}
                className="block aspect-[4/5] w-full rounded-md bg-soft object-cover"
              />
            ) : (
              <div aria-hidden="true" className="flex aspect-[4/5] w-full items-center justify-center rounded-md bg-soft text-5xl font-extrabold text-muted">
                {person.display_name.charAt(0).toUpperCase()}
              </div>
            )}
            {headshot?.photographer_credit && <span className="text-xs text-muted">Photo: {headshot.photographer_credit}</span>}
          </div>
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="display text-[40px] md:text-[60px]" style={{ lineHeight: 1 }}>
                {person.display_name}
              </h1>
              {!isOwner && <EditButton kind="person" slug={person.slug} signedIn={!!user} />}
            </div>
            <p className="m-0 text-muted">
              {descriptor}
              {person.verified_owner_id && (
                <>
                  {" · "}
                  <VerifiedMark />
                  {owner?.username && (
                    <>
                      {" · "}
                      <Link href={`/u/${owner.username}`} className="font-semibold text-ink">
                        Contributor profile
                      </Link>
                    </>
                  )}
                </>
              )}
            </p>
            {person.bio ? (
              <p className="m-0 max-w-[620px] whitespace-pre-line">{person.bio}</p>
            ) : (
              editing && <p className="m-0 text-muted">No bio yet.</p>
            )}
            {links.length > 0 && (
              <p className="m-0 flex flex-wrap gap-x-4 gap-y-1">
                {links.map((l) => (
                  <a key={l.url} href={l.url} rel="nofollow ugc noopener noreferrer" target="_blank" className="font-semibold">
                    {l.label || l.url}
                  </a>
                ))}
              </p>
            )}
            {!isOwner && (
              <div className="mt-1">
                <FollowButton
                  target={{ personId: person.id }}
                  following={!!myFollow}
                  count={followers ?? 0}
                  path={pagePath}
                  signedIn={!!user}
                />
              </div>
            )}
            {isOwner && (
              <p className="m-0 text-sm text-muted">
                {followers ?? 0} {followers === 1 ? "follower" : "followers"}
              </p>
            )}
            {!!seen && (
              <p className="m-0 text-[15px]">
                <span>
                  <strong>Seen {seen}</strong> {seen === 1 ? "production" : "productions"}
                  {isOwner && <span className="text-muted"> · from “Did you see it?” on production pages</span>}
                </span>
              </p>
            )}
            {editing && (
              <div className="mt-1 flex flex-col gap-3">
                <BioLinksEditor slug={person.slug} bio={person.bio ?? ""} links={links} />
                <SuggestCorrection personId={person.id} slug={person.slug} currentName={person.display_name} label="Suggest a name change" />
              </div>
            )}
            {!isOwner &&
              (user ? (
                <HeadshotUploader personId={person.id} hasHeadshot={!!headshot} />
              ) : (
                !headshot && (
                  <Link href={`/signin?next=${encodeURIComponent(pagePath)}`} className="self-start text-[15px] font-semibold">
                    Sign in to add a headshot
                  </Link>
                )
              ))}
            {pendingHeadshots > 0 && (
              <p className="m-0 text-sm text-muted">
                {pendingHeadshots === 1 ? "Your headshot is" : `Your ${pendingHeadshots} headshots are`} waiting for a moderator.
              </p>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="heading">On stage</h2>
          {shelf.size === 0 ? (
            <p className="m-0 text-muted">Productions will appear here as credits are added.</p>
          ) : (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
              {[...shelf.values()].map(({ prod, title, roles }) => (
                <PosterTile
                  key={prod.id}
                  href={`/production/${prod.slug}`}
                  title={title}
                  ground={prod.color_ground}
                  posterUrl={mediaUrl(prod.poster?.thumb_key)}
                  caption={
                    <>
                      <span className="font-bold">{roles.join(", ")}</span>
                      <span className="text-[13px] text-muted">
                        {title} ({prod.year})
                      </span>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Credits read like a résumé, so the table gets the full width */}
        <div className="flex flex-col gap-12">
          <section className="min-w-0">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 className="heading">Credits</h2>
              {editing && <AddCreditForm slug={person.slug} />}
            </div>
            {listed.length === 0 ? (
              <p className="m-0 text-muted">Credits will appear here as productions are added.</p>
            ) : (
              <div className="flex flex-col gap-8">
                {(["cast", "crew"] as const)
                  .map((kind) => ({ kind, rows: listed.filter((c) => c.kind === kind) }))
                  .filter((g) => g.rows.length > 0)
                  .map((g, _, groups) => (
                    <div key={g.kind} className="flex flex-col gap-1">
                      {groups.length > 1 && (
                        <h3 id={`credits-${g.kind}`} className="subheading">
                          {g.kind === "cast" ? "Cast" : "Crew"}
                        </h3>
                      )}
                      {/* A résumé-style table. On phones, company and year move under the production. */}
                      <table aria-labelledby={groups.length > 1 ? `credits-${g.kind}` : undefined} className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b-2 border-ink text-sm text-muted">
                            <th scope="col" className="py-2 pr-4 font-semibold">Production</th>
                            <th scope="col" className="py-2 pr-4 font-semibold">{g.kind === "cast" ? "Role" : "Position"}</th>
                            <th scope="col" className="hidden py-2 pr-4 font-semibold md:table-cell">Company</th>
                            <th scope="col" className="hidden py-2 pr-4 font-semibold lg:table-cell">Venue</th>
                            <th scope="col" className="hidden py-2 text-right font-semibold md:table-cell">Year</th>
                            {editing && (
                              <th scope="col" className="w-11 py-2">
                                <span className="sr-only">Show or hide</span>
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((c) => {
                            const dot = swatch(showColors(c.prod));
                            const org = c.prod.organization;
                            const venue = c.prod.location;
                            const hidden = c.hidden_on_person_page;
                            return (
                              <tr key={c.id} className={`border-b border-rule align-top ${hidden ? "text-muted" : ""}`}>
                                <td className="py-3 pr-4">
                                  <span className="flex items-start gap-2.5">
                                    <span
                                      aria-hidden="true"
                                      className={`mt-[7px] h-2.5 w-2.5 flex-none rounded-full border ${hidden ? "opacity-50" : ""}`}
                                      style={{ background: dot.background, borderColor: dot.borderColor }}
                                    />
                                    <span className="flex min-w-0 flex-col">
                                      <Link href={`/production/${c.prod.slug}`} className="link-quiet font-bold">
                                        {c.title}
                                      </Link>
                                      <span className="text-sm text-muted md:hidden">
                                        {[org?.name, c.prod.year].filter(Boolean).join(" · ")}
                                      </span>
                                      {c.added_by_owner && (
                                        <span className="inline-flex items-center gap-1 text-[13px] text-muted">
                                          Added by{" "}
                                          {owner?.username ? (
                                            <Link href={`/u/${owner.username}`} className="font-semibold text-ink">
                                              {owner.display_name}
                                            </Link>
                                          ) : (
                                            "the performer"
                                          )}
                                          <ContributorMedal points={ownerPoints} />
                                        </span>
                                      )}
                                      {editing && hidden && <span className="text-[13px] font-semibold">Hidden from your page</span>}
                                    </span>
                                  </span>
                                </td>
                                <td className="py-3 pr-4">
                                  {editing ? <EditableRole slug={person.slug} creditId={c.id} role={c.role} /> : c.role}
                                </td>
                                <td className="hidden py-3 pr-4 md:table-cell">
                                  {org ? (
                                    <Link href={`/company/${org.slug}`} className="link-quiet">
                                      {org.name}
                                    </Link>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="hidden py-3 pr-4 lg:table-cell">
                                  {venue ? (
                                    <Link href={`/venue/${venue.slug}`} className="link-quiet">
                                      {venue.name}
                                    </Link>
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </td>
                                <td className="hidden whitespace-nowrap py-3 text-right tabular-nums text-muted md:table-cell">{c.prod.year}</td>
                                {editing && (
                                  <td className="py-3">
                                    <HideCreditToggle slug={person.slug} creditId={c.id} hidden={hidden} />
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <aside className="grid min-w-0 grid-cols-1 gap-8 border-t border-rule pt-8 md:grid-cols-3">
            {editing && (
              <section className="flex flex-col gap-3">
                <h2 className="subheading">Your headshots</h2>
                <HeadshotChooser
                  slug={person.slug}
                  currentId={headshot?.id ?? null}
                  headshots={(headshots ?? []).map((h) => ({ id: h.id, url: mediaUrl(h.thumb_key ?? h.storage_key)! }))}
                />
                <HeadshotUploader personId={person.id} hasHeadshot={!!headshot} />
              </section>
            )}
            <section className="flex flex-col gap-2">
              <h2 className="subheading">Frequent collaborators</h2>
              {collaborators?.length ? (
                collaborators.map((f) => (
                  <Link key={f.person_id} href={`/person/${f.slug}`}>
                    {f.display_name} · {f.shows_together} shows together
                  </Link>
                ))
              ) : (
                <p className="m-0 text-[15px] text-muted">People who share two or more productions will appear here.</p>
              )}
            </section>
            <section className="flex flex-col gap-1.5">
              <h2 className="subheading">Awards</h2>
              {awards.length ? (
                <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
                  {awards.map((a) => (
                    <li key={a.id}>
                      <span className={a.result === "won" ? "font-bold" : ""}>{awardSentence(a)}</span>
                      {a.production && (
                        <>
                          {" · "}
                          <Link href={`/production/${a.production.slug}`}>{productionTitle(a)}</Link>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-[15px] text-muted">None recorded yet.</p>
              )}
            </section>
          </aside>
        </div>

        {editing && !person.is_hidden && (
          <section className="flex flex-col gap-2 border-t border-rule pt-6">
            <HidePageButton slug={person.slug} />
          </section>
        )}
        {!isOwner && <SuggestEdit kind="person" slug={person.slug} signedIn={!!user} />}
        {!person.is_hidden && <ViewTracker table="people" id={person.id} />}
        <ModeratorDeleteSection table="people" id={person.id} name={person.display_name} afterDelete="/people" />
      </main>
    </>
  );
}
