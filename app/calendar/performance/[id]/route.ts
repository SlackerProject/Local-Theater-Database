import { createClient } from "@/lib/supabase/server";
import { icsCalendar } from "@/lib/calendar";
import { siteOrigin } from "@/lib/site";

// One performance as an .ics file: "Download for Apple or Outlook"
export async function GET(_req: Request, { params }: RouteContext<"/calendar/performance/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: pf } = await supabase
    .from("performances")
    .select(
      `id, starts_at, label,
       location:locations(name, street_address, town, state),
       production:productions(slug, year, title_override, show:shows(title), organization:organizations(name),
                              location:locations(name, street_address, town, state))`,
    )
    .eq("id", id)
    .maybeSingle();
  const p = pf?.production;
  if (!pf || !p?.show) return new Response("Performance not found", { status: 404 });

  const venue = pf.location ?? p.location;
  const title = `${p.title_override ?? p.show.title} (${p.year})`;
  const body = icsCalendar([
    {
      id: pf.id,
      startsAt: pf.starts_at,
      title,
      company: p.organization?.name,
      label: pf.label,
      venue: venue?.name,
      address: venue ? [venue.street_address, venue.town, venue.state].filter(Boolean).join(", ") : null,
      url: `${await siteOrigin()}/production/${p.slug}`,
    },
  ]);
  const file = `${p.slug}-${pf.starts_at.slice(0, 10)}.ics`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
    },
  });
}
