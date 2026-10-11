import { createClient } from "@/lib/supabase/server";
import { icsCalendar } from "@/lib/calendar";
import { siteOrigin } from "@/lib/site";

// A member's private subscription link: every performance they're Going to.
// Calendar apps fetch it on their own schedule, signed out, so the long
// random token in the address is the only key (reset it to revoke).
export async function GET(_req: Request, { params }: RouteContext<"/calendar/feed/[token]">) {
  const token = (await params).token.replace(/\.ics$/i, "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });
  if (error) return new Response("Calendar unavailable", { status: 500 });

  // An unknown (or reset) link gets an empty calendar, the same as a member
  // with nothing planned, so trying addresses reveals nothing
  const origin = await siteOrigin();
  const body = icsCalendar(
    (data ?? []).map((r) => ({
      id: r.performance_id,
      startsAt: r.starts_at,
      title: `${r.title} (${r.year})`,
      company: r.company,
      label: r.label,
      venue: r.venue,
      address: r.address || null,
      url: `${origin}/production/${r.production_slug}`,
    })),
    "Local theater: shows I’m going to",
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
