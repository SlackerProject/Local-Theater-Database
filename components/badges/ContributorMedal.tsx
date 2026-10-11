import { levelFor } from "@/lib/badges";
import { createClient } from "@/lib/supabase/server";
import { Medal } from "./Medal";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

// The small medal beside a contributor's name, used only in contribution
// contexts: "Added by", edit history and moderation (DESIGN.md). The dots
// under it show the level (I, II, III); hovering shows it in words.
export function ContributorMedal({ points }: { points: number | undefined }) {
  const p = points ?? 0;
  const level = levelFor(p);
  if (!level) return null;
  return (
    <span title={`${level.name} contributor · ${fmt(p)} pts`} className="inline-flex align-[-5px]">
      <Medal metal={level.metal} dots={level.tier} size={22} />
      <span className="sr-only"> ({level.name} contributor)</span>
    </span>
  );
}

// Moderation: the same medal, and a plain outline for accounts that haven't
// earned one yet, so newcomers stand out too
export function ContributorTag({ points }: { points: number | undefined }) {
  const p = points ?? 0;
  if (levelFor(p)) return <ContributorMedal points={p} />;
  return (
    <span title={`New contributor · ${fmt(p)} pts`} className="inline-flex align-[-5px]">
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 48 50">
        <circle cx="24" cy="22" r="15" fill="none" stroke="#949494" strokeWidth="2.5" strokeDasharray="4 3" />
      </svg>
      <span className="sr-only"> (new contributor)</span>
    </span>
  );
}

// Points for a set of accounts, for showing their medals
export async function pointsFor(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map<string, number>();
  const supabase = await createClient();
  const { data } = await supabase.from("user_points").select("user_id, points").in("user_id", unique);
  return new Map((data ?? []).flatMap((r) => (r.user_id ? [[r.user_id, Number(r.points ?? 0)] as const] : [])));
}
