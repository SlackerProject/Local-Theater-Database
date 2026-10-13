import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ProductionsByYear } from "@/components/ProductionsByYear";
import { mediaUrl } from "@/lib/media";
import { getCurrentUser } from "@/lib/auth";
import { FollowButton } from "@/components/FollowButton";
import { ModeratorDeleteSection } from "@/components/ModeratorDeleteSection";
import { EditButton, SuggestEdit } from "@/components/SuggestEdit";
import { CompanyLogo } from "@/components/CompanyLogo";
import { LogoUploader } from "@/components/uploads/UploadPanels";

export default function CompanyPage({ params }: PageProps<"/company/[slug]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-12 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Company params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Company({ params }: Pick<PageProps<"/company/[slug]">, "params">) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select(
      `id, name, town, state, website_url, founded_year, description,
       logo:media!organizations_logo_fk(thumb_key, storage_key, photographer_credit),
       productions(id, slug, year, title_override, color_ground, poster:media!productions_poster_fk(thumb_key),
                   show:shows(title), location:locations(id, slug, name, town)),
       organization_locations(is_home_venue, location:locations(id, slug, name, town))`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!org) notFound();

  const user = await getCurrentUser();
  const [{ data: followers }, { data: myFollow }, { count: myPendingLogos }] = await Promise.all([
    supabase.rpc("follower_count", { p_organization_id: org.id }),
    user
      ? supabase.from("follows").select("id").eq("user_id", user.id).eq("organization_id", org.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase
          .from("media")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org.id)
          .eq("uploaded_by", user.id)
          .eq("status", "pending")
      : Promise.resolve({ count: 0 }),
  ]);

  // Venues: those linked to the company plus any it has performed at
  const venues = new Map<string, { slug: string; name: string; town: string | null; home: boolean }>();
  for (const ol of org.organization_locations ?? []) {
    if (ol.location) venues.set(ol.location.id, { ...ol.location, home: ol.is_home_venue });
  }
  for (const p of org.productions ?? []) {
    if (p.location && !venues.has(p.location.id)) venues.set(p.location.id, { ...p.location, home: false });
  }

  const website = org.website_url?.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4 md:gap-6">
            <CompanyLogo thumbKey={org.logo?.thumb_key ?? org.logo?.storage_key} name={org.name} size={88} className="md:hidden" />
            <CompanyLogo thumbKey={org.logo?.thumb_key ?? org.logo?.storage_key} name={org.name} size={128} className="hidden md:flex" />
            <h1 className="display min-w-0 text-[42px] md:text-[72px]">{org.name}</h1>
          </div>
          <EditButton kind="company" slug={slug} signedIn={!!user} />
        </div>
        <p className="m-0 text-[17px] text-muted">
          {[org.town && `${org.town}, ${org.state}`, org.founded_year && `Founded ${org.founded_year}`].filter(Boolean).join(" · ")}
          {org.website_url && (
            <>
              {(org.town || org.founded_year) && " · "}
              <a href={org.website_url} rel="noopener noreferrer" target="_blank" className="text-ink">
                {website}
              </a>
            </>
          )}
        </p>
        {org.description && <p className="m-0 max-w-[620px]">{org.description}</p>}
        <div className="flex flex-col gap-1">
          {user ? (
            <LogoUploader organizationId={org.id} hasLogo={!!org.logo} />
          ) : (
            !org.logo && (
              <Link href={`/signin?next=${encodeURIComponent(`/company/${slug}`)}`} className="self-start text-[15px] font-semibold">
                Sign in to add a logo
              </Link>
            )
          )}
          {!!myPendingLogos && <span className="text-sm text-muted">Your logo is waiting for a moderator.</span>}
          {org.logo?.photographer_credit && <span className="text-xs text-muted">Logo: {org.logo.photographer_credit}</span>}
        </div>
        <div className="mt-1">
          <FollowButton
            target={{ organizationId: org.id }}
            following={!!myFollow}
            count={followers ?? 0}
            path={`/company/${slug}`}
            signedIn={!!user}
          />
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-12">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
          <ProductionsByYear
            empty="This company’s productions will appear here as they’re added."
            productions={(org.productions ?? [])
              .filter((p) => p.show)
              .map((p) => ({
                id: p.id,
                slug: p.slug,
                year: p.year,
                title: p.title_override ?? p.show!.title,
                ground: p.color_ground,
                posterUrl: mediaUrl(p.poster?.thumb_key),
                caption: p.location?.name ?? "",
              }))}
          />
        </div>
        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-7">
          <section className="flex flex-col gap-2">
            <h2 className="subheading">Venues</h2>
            {venues.size === 0 ? (
              <p className="m-0 text-[15px] text-muted">Venues this company uses will appear here.</p>
            ) : (
              [...venues.values()].map((v) => (
                <span key={v.slug}>
                  <Link href={`/venue/${v.slug}`}>{v.name}</Link>
                  <span className="text-[15px] text-muted">
                    {[v.town, v.home && "home venue"].filter(Boolean).map((x) => ` · ${x}`)}
                  </span>
                </span>
              ))
            )}
          </section>
          <section className="flex flex-col gap-1.5">
            <h2 className="subheading">Awards</h2>
            <p className="m-0 text-[15px] text-muted">None recorded yet. EMACT nominations and wins will appear here.</p>
          </section>
        </aside>
      </div>
      <SuggestEdit kind="company" slug={slug} signedIn={!!user} />
      <ModeratorDeleteSection table="organizations" id={org.id} name={org.name} afterDelete="/companies" />
    </>
  );
}
