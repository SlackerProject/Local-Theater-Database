import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Role = "member" | "trusted" | "moderator" | "admin";

export type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
};

const ROLE_ORDER: Role[] = ["member", "trusted", "moderator", "admin"];

export function hasRole(user: CurrentUser | null, minRole: Role) {
  return !!user && ROLE_ORDER.indexOf(user.role) >= ROLE_ORDER.indexOf(minRole);
}

// The signed-in member's profile, or null. Reads the session cookie, so call
// it inside a <Suspense> boundary.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    role: profile.role,
  };
}
