// Reading role text the way programs write it, shared by the Add form,
// the edit page and pasted cast lists.

const UNDERSTUDY = /^\s*(understudy|u\/s)\s*(?:for|of)?\s*[-:–—]?\s*/i;

// "Mrs. Jefferson, Bohemian" or "Eugene/Stanley" -> each role, tidied
export function splitRoles(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/\s*[,/;]\s*/)) {
    const role = part.trim().replace(/\s+/g, " ");
    if (role && !out.some((r) => r.toLowerCase() === role.toLowerCase())) out.push(role);
  }
  return out;
}

// "Understudy - Joanne Jefferson", "u/s Joanne" -> { understudy: true, text: "Joanne Jefferson" }
export function readUnderstudy(text: string): { understudy: boolean; text: string } {
  return UNDERSTUDY.test(text) ? { understudy: true, text: text.replace(UNDERSTUDY, "") } : { understudy: false, text };
}

// One person's credits in a production, for showing them together:
// the roles they play, and the roles they understudy
export type PersonCredits<P> = { person: P; roles: string[]; covers: string[]; first: number };

export function groupByPerson<P>(
  credits: { person: P | null; role: string; understudy?: boolean; order: number }[],
  key: (p: P) => string,
): PersonCredits<P>[] {
  const groups = new Map<string, PersonCredits<P>>();
  for (const c of [...credits].sort((a, b) => a.order - b.order)) {
    if (!c.person) continue;
    const k = key(c.person);
    const g = groups.get(k) ?? { person: c.person, roles: [], covers: [], first: Infinity };
    const list = c.understudy ? g.covers : g.roles;
    if (c.role && !list.includes(c.role)) list.push(c.role);
    // People are ordered by their first role they play (understudying alone comes last)
    if (!c.understudy) g.first = Math.min(g.first, c.order);
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => (a.first === b.first ? 0 : a.first - b.first));
}
