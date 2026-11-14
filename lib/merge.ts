// What can be merged, and what each kind is called (shared by the
// Duplicates page and its browser-side tools)
export type MergeTable = "people" | "shows" | "organizations" | "locations" | "productions";

export const NOUN: Record<MergeTable, string> = {
  people: "person",
  shows: "show",
  organizations: "company",
  locations: "venue",
  productions: "production",
};

export const PAGE_PATH: Record<MergeTable, string> = {
  people: "person",
  shows: "show",
  organizations: "company",
  locations: "venue",
  productions: "production",
};
