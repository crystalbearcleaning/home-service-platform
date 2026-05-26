import "server-only";

import { createClient } from "@/core/auth/server";

// Phase 6D — list every business the current user is an active member of,
// for the workspace switcher. Reads under the user's session so RLS does
// the authorization; falls back to an empty list on errors.

export type WorkspaceOption = {
  id: string;
  slug: string;
  name: string;
  isSimulation: boolean;
};

export async function listMembershipBusinessesForUser(
  userId: string,
): Promise<WorkspaceOption[]> {
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("business_memberships")
    .select("business_id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (!memberships || memberships.length === 0) return [];

  const ids = Array.from(
    new Set(
      memberships
        .map((m) => m.business_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );
  if (ids.length === 0) return [];

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, slug, name, is_simulation")
    .in("id", ids);

  if (!businesses) return [];

  return businesses
    .map((b) => ({
      id: b.id as string,
      slug: b.slug as string,
      name: b.name as string,
      isSimulation: Boolean((b as { is_simulation?: unknown }).is_simulation),
    }))
    .sort((a, b) => {
      // Real workspaces first, then simulation workspaces; alpha within group.
      if (a.isSimulation !== b.isSimulation) return a.isSimulation ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
}
