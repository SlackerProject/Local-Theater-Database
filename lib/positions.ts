// Creative team and crew positions. The working list lives in the
// database (crew_positions): dropdowns show it A to Z, and production pages
// order the creative team by its rank (this order). Moderators can add
// positions approved from "Other…"; new ones go to the end of the order.
// This copy is the starting list, used until the database list loads.
export const CREW_POSITIONS = [
  "Director",
  "Choreographer",
  "Music Director",
  "Co-Production Manager",
  "Stage Manager",
  "Asst. Stage Manager",
  "Set Designer",
  "Costume Designer",
  "Lighting Designer",
  "Sound Designer",
  "Set Decor",
  "Properties",
  "Costumer",
  "Build Coordinator",
  "Sound Engineer",
  "Production Properties Master",
  "Technical Consultant",
  "Sound Design and Engineering",
  "Hair and Makeup",
  "Intimacy Coordinator",
  "Sound Operator",
  "Lights Operator",
  "Dresser",
] as const;

// Positions in this set of roles that aren't on the list yet ("Fight
// Captain"), for moderators to add when they approve
export function unlistedPositions(roles: string[], known: string[]) {
  const have = new Set(known.map((k) => k.toLowerCase()));
  const seen = new Set<string>();
  return roles
    .map((r) => r.trim().replace(/\s+/g, " "))
    .filter((r) => {
      const k = r.toLowerCase();
      if (r.length < 2 || have.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}
