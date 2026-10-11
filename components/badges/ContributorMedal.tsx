import { levelFor } from "@/lib/badges";
import { createClient } from "@/lib/supabase/server";
import { Medal } from "./Medal";

// The 18px medal beside a contributor's name, used only in contribution
// contexts: "Added by", edit history and moderation (DESIGN.md)
export function ContributorMedal({ points }: { points: number | undefined }) {
  const level = levelFor(points ?? 0);
  if (!level) return null;
  return (
    <span title={`${level.name} contributor`} className="inline-flex align-[-3px]">
      <Medal metal={level.metal} size={18} />
      <span className="sr-only"> ({level.name} contributor)</span>
    </span>
  );
}

// Points for a set of accounts, for showing their medals
export async function pointsFor(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map<string, number>();
  const supabase = await createClient();
  const { data } = await supabase.from("user_points").select("user_id, points").in("user_id", unique);
  return new Map((data ?? []).flatMap((r) => (r.user_id ? [[r.user_id, r.points ?? 0] as const] : [])));
}
