// Creative team and crew positions offered in every crew dropdown. "Other…"
// in the dropdown still allows anything not on the list.
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

// The list's own spelling for a typed position ("stage manager" -> "Stage Manager")
export function knownPosition(value: string) {
  const v = value.trim().toLowerCase();
  return CREW_POSITIONS.find((p) => p.toLowerCase() === v) ?? null;
}
