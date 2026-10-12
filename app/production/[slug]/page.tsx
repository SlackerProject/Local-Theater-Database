import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { showColors } from "@/lib/palette";
import { SHOW_TYPES } from "@/lib/submission";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PosterTile } from "@/components/PosterTile";
import { PhotoGallery } from "@/components/PhotoGallery";
import { PhotoUploader, PosterUploader } from "@/components/uploads/UploadPanels";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { PHOTO_LIMIT, mediaUrl } from "@/lib/media";
import { currentTime, googleCalendarUrl, localDate, localDay, localHHMM, localTime, TIME_ZONE } from "@/lib/calendar";
import { Auditions, type AuditionRow } from "./Auditions";
import { siteOrigin } from "@/lib/site";
import { HeroActions, type PerformanceRow } from "./HeroActions";
import { ModeratorDeleteSection } from "@/components/ModeratorDeleteSection";
import { AddThemLink, EditButton, SuggestEdit } from "@/components/SuggestEdit";
import { ViewTracker } from "@/components/ViewTracker";
import { AWARD_SELECT, awardSentence, sortAwards, type AwardRow } from "@/lib/awards";
import { groupByPerson, type PersonCredits } from "@/lib/credits";

type CastPerson = { slug: string; display_name: string; headshot: { thumb_key: string | null } | null };

// The cast, one entry per person: every role they play, then any they understudy
function CastGrid({ people }: { people: PersonCredits<CastPerson>[] }) {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-x-10 p-0 md:grid-cols-2">
      {people.map(({ person, roles, covers }) => (
        <li key={person.slug}>
          <Link href={`/person/${person.slug}`} className="link-quiet flex items-start gap-3 border-b border-rule py-2.5">
            {person.headshot?.thumb_key ? (
              <img src={mediaUrl(person.headshot.thumb_key)!} alt="" loading="lazy" className="h-11 w-11 flex-none rounded-full bg-soft object-cover" />
            ) : (
              <span aria-hidden="true" className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-soft font-bold text-muted">
                {person.display_name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="flex min-w-0 flex-col">
              <span className="font-bold">{person.display_name}</span>
              {roles.length > 0 && <span className="text-sm text-muted">{roles.join(", ")}</span>}
              {covers.length > 0 && (
                <span className="text-sm text-muted">
                  <span className="font-semibold text-ink">Understudy</span> for {covers.join(", ")}
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function ProductionPage({ params }: PageProps<"/production/[slug]">) {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<p className="mx-auto w-full max-w-[1180px] px-4 py-12 text-muted md:px-8">Loading…</p>}>
        <Production params={params} />
      </Suspense>
      <SiteFooter />
    </>
  );
}

function formatDate(date: string, withYear = true) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear && { year: "numeric" }),
    timeZone: "UTC",
  });
}

function dateRange(opening: string | null, closing: string | null) {
  if (opening && closing && opening !== closing) {
    const sameYear = opening.slice(0, 4) === closing.slice(0, 4);
    return `${formatDate(opening, !sameYear)} – ${formatDate(closing)}`;
  }
  return opening ? formatDate(opening) : closing ? formatDate(closing) : null;
}

async function Production({ params }: Pick<PageProps<"/production/[slug]">, "params">) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("productions")
    .select(
      `id, slug, year, title_override, opening_date, closing_date, description, audition_note, audition_url,
       auditions(id, starts_at, ends_at, label, place, location_id, venue:locations(slug, name)),
       color_ground, color_ground_2, color_ink, color_soft, color_accent,
       poster:media!productions_poster_fk(thumb_key, storage_key, width, height),
       show:shows(id, slug, title, subtitle, type, authors),
       organization:organizations(slug, name),
       location:locations(id, slug, name, street_address, town, state),
       performances(id, starts_at, label, is_cancelled),
       credits(id, kind, role_name, billing_order, is_understudy,
               person:people(slug, display_name, headshot:media!people_headshot_fk(thumb_key)),
               character:show_characters(name))`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!p || !p.show) notFound();

  const [{ data: others }, { data: photoRows }, user] = await Promise.all([
    supabase
      .from("productions")
      .select("id, slug, year, color_ground, poster:media!productions_poster_fk(thumb_key), organization:organizations(name)")
      .eq("show_id", p.show.id)
      .neq("id", p.id)
      .order("year", { ascending: false })
      .limit(8),
    supabase
      .from("media")
      .select("id, storage_key, thumb_key, photographer_credit, caption, status, uploaded_by")
      .eq("production_id", p.id)
      .eq("kind", "production_photo")
      .neq("status", "rejected")
      .order("created_at", { ascending: true }),
    getCurrentUser(),
  ]);
  const { data: awardRows } = await supabase.from("award_entries").select(AWARD_SELECT).eq("production_id", p.id);
  const awards = sortAwards((awardRows ?? []) as unknown as AwardRow[]);
  const [{ data: watch }, { data: auditionFollow }, { data: myAuditionProposal }] = user
    ? await Promise.all([
        supabase.from("watch_list").select("status, performance_id").eq("user_id", user.id).eq("production_id", p.id).maybeSingle(),
        supabase.from("audition_follows").select("production_id").eq("user_id", user.id).eq("production_id", p.id).maybeSingle(),
        supabase
          .from("edit_proposals")
          .select("id")
          .eq("entity_table", "auditions")
          .eq("entity_id", p.id)
          .eq("proposed_by", user.id)
          .eq("status", "pending")
          .limit(1)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }, { data: null }];
  const approvedPhotos = (photoRows ?? []).filter((m) => m.status === "approved");
  const myPending = (photoRows ?? []).filter((m) => m.status === "pending" && m.uploaded_by === user?.id).length;
  // Others' pending photos aren't visible here, so this can overcount the room left; the database has the final say
  const remaining = PHOTO_LIMIT - (photoRows ?? []).length;
  const signInHref = `/signin?next=${encodeURIComponent(`/production/${p.slug}`)}`;

  const c = showColors(p);
  const title = p.title_override ?? p.show.title;
  const credits = (p.credits ?? []).filter((x) => x.person).sort((a, b) => a.billing_order - b.billing_order);
  const cast = credits.filter((x) => x.kind === "cast");
  // Creative team in the positions' order (Director first); positions not
  // on the list come last, then billing order
  const { data: positionRows } = await supabase.from("crew_positions").select("name, rank");
  const rankOf = new Map((positionRows ?? []).map((r) => [r.name.toLowerCase(), r.rank]));
  const crewRank = (role: string | null) => rankOf.get((role ?? "").trim().toLowerCase()) ?? 10000;
  const crew = credits
    .filter((x) => x.kind === "crew")
    .sort((a, b) => crewRank(a.role_name) - crewRank(b.role_name) || a.billing_order - b.billing_order);
  // One entry per person, with every role they play (and cover)
  const castPeople = groupByPerson(
    cast.map((x) => ({ person: x.person, role: x.character?.name ?? x.role_name ?? "", understudy: x.is_understudy, order: x.billing_order })),
    (pe) => pe.slug,
  );
  const castPlaying = castPeople.filter((g) => g.roles.length > 0);
  const understudiesOnly = castPeople.filter((g) => g.roles.length === 0);
  const crewPeople = groupByPerson(
    crew.map((x, i) => ({ person: x.person, role: x.role_name ?? "", order: i })),
    (pe) => pe.slug,
  );
  const typeLabel = SHOW_TYPES.find((t) => t.value === p.show!.type)?.label;
  const about = [p.show.subtitle ?? typeLabel, p.show.authors].filter(Boolean).join(" · ");
  const dates = dateRange(p.opening_date, p.closing_date);
  const path = `/production/${p.slug}`;
  const origin = await siteOrigin();
  const now = currentTime().getTime();
  const venueAddress = p.location ? [p.location.street_address, p.location.town, p.location.state].filter(Boolean).join(", ") : null;
  const performances: PerformanceRow[] = [...(p.performances ?? [])]
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((pf) => ({
      id: pf.id,
      when: new Date(pf.starts_at).toLocaleString("en-US", {
        timeZone: TIME_ZONE,
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      day: localDay(pf.starts_at),
      time: localTime(pf.starts_at),
      label: pf.label,
      cancelled: pf.is_cancelled,
      past: new Date(pf.starts_at).getTime() < now,
      google: googleCalendarUrl({
        id: pf.id,
        startsAt: pf.starts_at,
        title: `${title} (${p.year})`,
        company: p.organization?.name,
        label: pf.label,
        venue: p.location?.name,
        address: venueAddress,
        url: origin + path,
      }),
      ics: `/calendar/performance/${pf.id}`,
    }));
  // The run has closed once its closing date (or, without one, its last
  // performance) is behind us
  const today = localDate(new Date(now));
  const closed = p.closing_date
    ? p.closing_date < today
    : performances.length > 0 && performances.every((pf) => pf.past);

  // Pre-cast until any cast is credited; auditions show while pre-cast or
  // while sessions are still ahead
  const precast = cast.length === 0 && !closed;
  const auditionSessions = [...(p.auditions ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const auditionRows: AuditionRow[] = auditionSessions.map((a) => ({
    id: a.id,
    label: a.label,
    when: `${localDay(a.starts_at)} · ${localTime(a.starts_at)}${a.ends_at ? ` – ${localTime(a.ends_at)}` : ""}`,
    venue: a.venue,
    place: a.place,
    past: new Date(a.starts_at).getTime() < now,
  }));
  const showAuditions = precast || auditionRows.some((a) => !a.past);
  // Before anyone's cast, the show's roles stand in for the cast list
  const { data: roleRows } = cast.length
    ? { data: [] }
    : await supabase.from("show_characters").select("id, name").eq("show_id", p.show.id).order("sort_order").order("name");
  const showRoles = roleRows ?? [];
  // The "Where" choices in the audition form (members only)
  const { data: locationRows } =
    showAuditions && user ? await supabase.from("locations").select("id, name, town").order("name") : { data: [] };
  const auditionLocations = locationRows ?? [];

  // Section heading rule takes the show's accent (ink when there's no poster)
  const sectionRule = { borderBottom: `2px solid ${c.accent}` };

  return (
    <>
      {/* Hero: the poster supplies the color */}
      <section
        style={{ background: `linear-gradient(180deg, ${c.ground} 0%, ${c.ground2} 100%)`, color: c.ink }}
        className={c.hasPalette ? "" : "border-b border-rule"}
      >
        <div className="mx-auto flex max-w-[1180px] flex-col items-start gap-[22px] px-4 pb-7 pt-6 md:flex-row md:items-end md:gap-12 md:px-8 md:py-12">
          <div className="w-[190px] flex-none md:w-[270px]">
            {p.poster ? (
              // A poster-shaped frame: any image, wide or tall, sits centered in it
              <div className="flex aspect-[2/3] w-full items-center justify-center">
                <img
                  src={mediaUrl(p.poster.thumb_key ?? p.poster.storage_key)!}
                  alt={`${title} poster`}
                  width={p.poster.width ?? undefined}
                  height={p.poster.height ?? undefined}
                  className="block h-auto max-h-full w-auto max-w-full rounded-[4px] shadow-[0_18px_40px_rgba(40,20,10,0.25)]"
                />
              </div>
            ) : (
              <PosterTile title={title} />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {p.organization ? (
                <Link href={`/company/${p.organization.slug}`} className="font-semibold underline" style={{ color: c.ink }}>
                  {p.organization.name}
                </Link>
              ) : (
                <span />
              )}
              <EditButton kind="production" slug={p.slug} signedIn={!!user} color={c.ink} />
            </div>
            <h1 className="display text-[42px] md:text-[72px]">
              {title} <span className="font-normal" style={{ color: c.accent }}>({p.year})</span>
            </h1>
            {about && (
              <p className="m-0 text-[17px]" style={{ color: c.soft }}>
                {about}
              </p>
            )}
            {(dates || p.location) && (
              <p className="m-0 text-[17px]" style={{ color: c.soft }}>
                {dates}
                {dates && p.location && " · "}
                {p.location && (
                  <Link href={`/venue/${p.location.slug}`} style={{ color: c.ink }}>
                    {p.location.name}
                  </Link>
                )}
              </p>
            )}
            {p.description && <p className="m-0 max-w-[620px]">{p.description}</p>}
            <HeroActions
              productionId={p.id}
              path={path}
              signedIn={!!user}
              status={watch?.status ?? null}
              goingId={watch?.performance_id ?? null}
              performances={performances}
              closed={closed}
              ink={c.ink}
              ground={c.ground}
            />
            {user ? (
              <PosterUploader productionId={p.id} hasPoster={!!p.poster} ink={c.ink} />
            ) : (
              !p.poster && (
                <Link href={signInHref} className="self-start text-[15px] font-semibold underline" style={{ color: c.ink }}>
                  Sign in to add a poster
                </Link>
              )
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-wrap items-start gap-12 px-4 pb-16 pt-7 md:px-8 md:pt-11">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
          {showAuditions && (
            <Auditions
              productionId={p.id}
              path={path}
              signedIn={!!user}
              precast={precast}
              sessions={auditionRows}
              editable={auditionSessions.map((a) => ({
                date: localDate(a.starts_at),
                start: localHHMM(a.starts_at),
                end: a.ends_at ? localHHMM(a.ends_at) : "",
                label: a.label ?? "",
                locationId: a.location_id ?? "",
              }))}
              locations={auditionLocations}
              defaultLocationId={p.location?.id ?? ""}
              note={p.audition_note}
              url={p.audition_url}
              following={!!auditionFollow}
              pendingMine={!!myAuditionProposal}
              canPublish={hasRole(user, "trusted")}
            />
          )}
          <section className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 className="heading">Photos</h2>
              {approvedPhotos.length > 0 && (
                <span className="text-sm text-muted">
                  {approvedPhotos.length} {approvedPhotos.length === 1 ? "photo" : "photos"}
                </span>
              )}
            </div>
            {approvedPhotos.length ? (
              <PhotoGallery
                title={title}
                photos={approvedPhotos.map((m) => ({
                  id: m.id,
                  full: mediaUrl(m.storage_key)!,
                  thumb: mediaUrl(m.thumb_key ?? m.storage_key)!,
                  credit: m.photographer_credit,
                  caption: m.caption,
                }))}
              />
            ) : (
              <p className="m-0 text-muted">Production photos will appear here once someone uploads them.</p>
            )}
            {myPending > 0 && (
              <p className="m-0 text-sm text-muted">
                You have {myPending} {myPending === 1 ? "photo" : "photos"} waiting for a moderator.
              </p>
            )}
            {user ? (
              <PhotoUploader productionId={p.id} remaining={remaining} />
            ) : (
              <Link href={signInHref} className="self-start font-semibold">
                Sign in to upload photos
              </Link>
            )}
          </section>

          <section className="flex flex-col">
            <div className="pb-1.5" style={sectionRule}>
              <h2 className="heading">Cast</h2>
            </div>
            {cast.length === 0 ? (
              <>
                {showRoles.length > 0 && (
                  <ul className="m-0 grid list-none grid-cols-1 gap-x-10 p-0 md:grid-cols-2">
                    {showRoles.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 border-b border-rule py-2.5">
                        <span aria-hidden="true" className="h-11 w-11 flex-none rounded-full border border-dashed border-[#A8A8A8]" />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-bold">{r.name}</span>
                          <span className="text-sm text-muted">{closed ? "Not listed" : "Not cast yet"}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="m-0 pt-3 text-muted">
                  {showRoles.length ? "Names will appear here once the cast is added." : "The cast will appear here once it’s added."}{" "}
                  <AddThemLink slug={p.slug} signedIn={!!user} section="cast">
                    Know who’s in the cast? Add them.
                  </AddThemLink>
                </p>
              </>
            ) : (
              <>
                <CastGrid people={castPlaying} />
                {understudiesOnly.length > 0 && (
                  <>
                    <h3 className="subheading mt-6">Understudies</h3>
                    <CastGrid people={understudiesOnly} />
                  </>
                )}
              </>
            )}
          </section>

          <section className="flex flex-col">
            <div className="pb-1.5" style={sectionRule}>
              <h2 className="heading">Creative team</h2>
            </div>
            {crew.length === 0 ? (
              <p className="m-0 pt-3 text-muted">
                The creative team will appear here once it’s added.{" "}
                <AddThemLink slug={p.slug} signedIn={!!user} section="crew">
                  Know who’s on the creative team? Add them.
                </AddThemLink>
              </p>
            ) : (
              crewPeople.map((g) => (
                <div key={g.person.slug} className="flex justify-between gap-4 border-b border-rule py-3">
                  <span className="text-muted">{g.roles.join(", ")}</span>
                  <Link href={`/person/${g.person.slug}`} className="flex-none text-right font-bold">
                    {g.person.display_name}
                  </Link>
                </div>
              ))
            )}
          </section>

          <SuggestEdit kind="production" slug={p.slug} signedIn={!!user} />
          <ViewTracker table="productions" id={p.id} />
          <ModeratorDeleteSection table="productions" id={p.id} name={`${title} (${p.year})`} afterDelete="/shows" />
        </div>

        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="subheading">
              Other productions of <Link href={`/show/${p.show.slug}`}>{p.show.title}</Link>
            </h2>
            {others?.length ? (
              <div className="grid grid-cols-2 gap-3.5">
                {others.map((o) => (
                  <PosterTile
                    key={o.id}
                    href={`/production/${o.slug}`}
                    title={p.show!.title}
                    ground={o.color_ground}
                    posterUrl={mediaUrl(o.poster?.thumb_key)}
                    caption={
                      <span className="text-[13px]">
                        <strong>{o.year}</strong> · {o.organization?.name}
                      </span>
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="m-0 text-[15px] text-muted">Other productions of this show will appear here as they’re added.</p>
            )}
          </section>
          <section className="flex flex-col gap-1.5">
            <h2 className="subheading">Awards</h2>
            {awards.length ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
                {awards.map((a) => (
                  <li key={a.id}>
                    <span className={a.result === "won" ? "font-bold" : ""}>{awardSentence(a)}</span>
                    {a.person && !a.person.is_hidden && (
                      <>
                        {" · "}
                        <Link href={`/person/${a.person.slug}`}>{a.person.display_name}</Link>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-[15px] text-muted">None recorded yet. EMACT nominations and wins will appear here.</p>
            )}
          </section>
        </aside>
      </main>
    </>
  );
}
