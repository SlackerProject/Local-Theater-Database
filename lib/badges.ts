// Contributor levels and collectible badges (DESIGN.md "Badges and points").
// The database records which badges each member has earned (user_badges);
// these helpers turn points into a level and describe each badge.

export type Metal = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export type Level = { key: string; metal: Metal; tier: 0 | 1 | 2 | 3; name: string; points: number };

const METAL_NAME: Record<Metal, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum", diamond: "Diamond" };
const ROMAN = ["", "I", "II", "III"] as const;

// Mirrors level_thresholds() in the database
export const LEVELS: Level[] = (
  [
    ["bronze", 1, 10],
    ["bronze", 2, 25],
    ["bronze", 3, 50],
    ["silver", 1, 100],
    ["silver", 2, 150],
    ["silver", 3, 225],
    ["gold", 1, 300],
    ["gold", 2, 400],
    ["gold", 3, 550],
    ["platinum", 1, 750],
    ["platinum", 2, 1000],
    ["platinum", 3, 1300],
    ["diamond", 0, 2000],
  ] as const
).map(([metal, tier, points]) => ({
  key: tier ? `${metal}-${tier}` : metal,
  metal,
  tier,
  name: tier ? `${METAL_NAME[metal]} ${ROMAN[tier]}` : METAL_NAME[metal],
  points,
}));

export const METALS: { metal: Metal; name: string; ladder: string }[] = [
  { metal: "bronze", name: "Bronze", ladder: "Levels I, II, III at 10 / 25 / 50 pts" },
  { metal: "silver", name: "Silver", ladder: "Levels I, II, III at 100 / 150 / 225 pts" },
  { metal: "gold", name: "Gold", ladder: "Levels I, II, III at 300 / 400 / 550 pts" },
  { metal: "platinum", name: "Platinum", ladder: "Levels I, II, III at 750 / 1,000 / 1,300 pts" },
  { metal: "diamond", name: "Diamond", ladder: "The summit at 2,000 pts" },
];

// The member's current level (null under 10 points)
export function levelFor(points: number): Level | null {
  let current: Level | null = null;
  for (const l of LEVELS) if (points >= l.points) current = l;
  return current;
}

export function nextLevel(points: number): Level | null {
  return LEVELS.find((l) => l.points > points) ?? null;
}

// The next new metal (e.g. Gold), when it's beyond the next level
export function nextMetal(points: number): Level | null {
  const current = levelFor(points);
  return LEVELS.find((l) => l.points > points && l.tier <= 1 && l.metal !== current?.metal) ?? null;
}

// "One or two more productions gets you there."
export function progressHint(remaining: number) {
  if (remaining <= 0.5) return "One more correction gets you there.";
  if (remaining <= 2) return "One more photo gets you there.";
  if (remaining <= 3) return "One more poster gets you there.";
  if (remaining <= 10) return "One more production gets you there.";
  if (remaining <= 20) return "One or two more productions gets you there.";
  return `About ${Math.ceil(remaining / 10)} more productions, or a mix of posters, photos and corrections, gets you there.`;
}

// Collectible badges, in display order
export type Collectible = { key: string; name: string; icon: "shield" | "mask" | "flag" | "ticket" | "camera"; number?: number };

export const COLLECTIBLES: Collectible[] = [
  { key: "moderator", name: "Moderator", icon: "shield" },
  { key: "verified", name: "Verified performer", icon: "mask" },
  { key: "founding", name: "Founding member", icon: "flag" },
  ...[10, 25, 50, 100, 250].map((n) => ({ key: `seen-${n}`, name: `${n} shows seen`, icon: "ticket" as const, number: n })),
  ...[10, 50].map((n) => ({ key: `photos-${n}`, name: `${n} photos added`, icon: "camera" as const, number: n })),
];

// "You reached Silver III" / "You earned the Founding member badge"
export function badgeMessage(key: string) {
  const level = LEVELS.find((l) => l.key === key);
  if (level) return `You reached ${level.name}`;
  const c = COLLECTIBLES.find((b) => b.key === key);
  return c ? `You earned the ${c.name} badge` : null;
}
