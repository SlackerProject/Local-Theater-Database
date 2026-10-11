import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DeleteTable } from "@/app/moderate/actions";
import { ModeratorDelete } from "./ModeratorDelete";

// Shown at the bottom of a page to moderators only
export async function ModeratorDeleteSection({
  table,
  id,
  name,
  afterDelete,
}: {
  table: DeleteTable;
  id: string;
  name: string;
  afterDelete: string;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user, "moderator")) return null;
  const supabase = await createClient();
  const [{ data: blockers }, { data: leftovers }] = await Promise.all([
    supabase.rpc("deletion_blockers", { p_table: table, p_id: id }),
    table === "productions" ? supabase.rpc("production_orphans", { p_production_id: id }) : Promise.resolve({ data: [] }),
  ]);
  return (
    <ModeratorDelete
      table={table}
      id={id}
      name={name}
      blockers={blockers ?? []}
      leftovers={(leftovers ?? []).map((l) => ({ entity_table: l.entity_table, label: l.label }))}
      afterDelete={afterDelete}
    />
  );
}
