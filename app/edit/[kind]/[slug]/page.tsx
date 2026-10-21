import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FIELDS, KINDS, type FieldValue, type PageKind } from "@/lib/corrections";
import { localDate, localHHMM } from "@/lib/calendar";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { CorrectionForm, type CreditLine, type PerformanceLine, type RoleLine } from "./CorrectionForm";
import type { VenueOption } from "@/components/VenueSelect";

export const metadata: Metadata = { title: "Correction" };

export default function EditPage({ params }: PageProps<"/edit/[kind]/[slug]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[980px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-10">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Edit params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Edit({ params }: Pick<PageProps<"/edit/[kind]/[slug]">, "params">) {
  const { kind, slug } = await params;
  if (!(kind in KINDS)) notFound();
  const pageKind = kind as PageKind;
  const { table } = KINDS[pageKind];
  const pagePath = `/${pageKind}/${slug}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/edit/${pageKind}/${slug}`)}`);
  const supabase = await createClient();

  const fields = FIELDS[table];
  const columns = ["id", ...fields.map((f) => f.key)].join(", ");
  const { data: row } = await supabase.from(table).select(columns).eq("slug", slug).maybeSingle();
  if (!row) notFound();
  const record = row as unknown as Record<string, FieldValue> & { id: string };

  const current: Record<string, FieldValue> = {};
  for (const f of fields) current[f.key] = record[f.key] ?? null;
  const labels: Record<string, string> = {};
  const locked: Record<string, string> = {};
  let name = String(record.display_name ?? record.name ?? record.title ?? slug);
  let credits: CreditLine[] | undefined;
  let performances: PerformanceLine[] | undefined;
  let venues: VenueOption[] = [];
  // Productions and shows edit the show's roles
  let roleShow: { id: string; title: string } | null = table === "shows" ? { id: record.id, title: name } : null;

  if (table === "productions") {
    const { data: p } = await supabase
      .from("productions")
      .select(
        `year, title_override, show:shows(id, title), organization:organizations(name), location:locations(name),
         credits(id, kind, role_name, billing_order, is_understudy, is_young_performer, person:people(id, display_name), character:show_characters(id, name)),
         performances(id, starts_at, label, is_cancelled, location_id)`,
      )
      .eq("id", record.id)
      .single();
    name = `${p?.title_override ?? p?.show?.title} (${p?.year})`;
    if (p?.show) roleShow = { id: p.show.id, title: p.show.title };
    if (p?.organization) labels.organization_id = p.organization.name;
    if (p?.location) labels.location_id = p.location.name;
    credits = (p?.credits ?? [])
      .sort((a, b) => a.billing_order - b.billing_order)
      .map((c) => ({
        id: c.id,
        kind: c.kind,
        person: c.is_young_performer ? "Young performer" : (c.person?.display_name ?? "Unknown"),
        role: c.character?.name ?? c.role_name ?? "",
        characterId: c.character?.id ?? null,
        personId: c.person?.id ?? "",
        understudy: c.is_understudy,
        young: c.is_young_performer,
      }));
    performances = (p?.performances ?? [])
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((pf) => ({
        id: pf.id,
        date: localDate(pf.starts_at),
        time: localHHMM(pf.starts_at),
        label: pf.label ?? "",
        cancelled: pf.is_cancelled,
        locationId: pf.location_id ?? "",
      }));
    // For performances at a different venue (touring shows)
    const { data: venueRows } = await supabase.from("locations").select("id, name, town").order("name");
    venues = venueRows ?? [];
  }

  if (table === "people") {
    const { data: pe } = await supabase.from("people").select("verified_owner_id").eq("id", record.id).single();
    if (pe?.verified_owner_id === user.id) {
      return (
        <section className="flex flex-col gap-3">
          <h1 className="heading">This Is Your Page</h1>
          <p className="m-0">
            Edit your bio, links and credits with the controls on <Link href={pagePath}>your page</Link>. Name changes go
            through “Suggest a name change” there.
          </p>
        </section>
      );
    }
    if (pe?.verified_owner_id) locked.bio = "Verified people write their own bio.";
  }

  let roles: RoleLine[] | undefined;
  if (roleShow) {
    const { data: chars } = await supabase
      .from("show_characters")
      .select("id, name, sort_order, credits(count)")
      .eq("show_id", roleShow.id)
      .order("sort_order")
      .order("name");
    roles = (chars ?? []).map((ch) => ({ id: ch.id, name: ch.name, inUse: (ch.credits?.[0]?.count ?? 0) > 0 }));
  }

  const isModerator = hasRole(user, "moderator");

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[26px] font-extrabold leading-tight md:text-[30px]">
          Correction for{" "}
          <Link href={pagePath} className="link-quiet underline">
            {name}
          </Link>
        </h1>
        <p className="m-0 max-w-[760px] text-[15px]">
          {isModerator ? (
            <>
              Make your changes, then click <strong>Save changes</strong>. As a moderator, your changes go live right away.
            </>
          ) : (
            <>
              Make your changes, then click <strong>Submit correction</strong>. A moderator reviews every correction before it
              goes live. Use the <strong>Notes to moderator</strong> box to say where the information comes from (a program,
              the company’s website, a cast list).
            </>
          )}
        </p>
      </div>
      <CorrectionForm
        table={table}
        id={record.id}
        pagePath={pagePath}
        fields={fields}
        current={current}
        labels={labels}
        locked={locked}
        credits={credits}
        performances={performances}
        venues={venues}
        roles={roles}
        showTitle={roleShow?.title}
        isModerator={isModerator}
      />
    </>
  );
}
