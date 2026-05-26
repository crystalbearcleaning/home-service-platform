import { createClient } from "@/core/auth/server";
import { readSelectedBusinessCookie } from "./workspace-selection";

export type ActiveBusinessSummary = {
  id: string;
  slug: string;
  name: string;
  isSimulation: boolean;
  membershipId: string;
  roleName: string | null;
  roleKey: string | null;
  appSurfacesCount: number;
  installedPluginsCount: number;
};

// Phase 6D: the active workspace is whichever business the user
// 1. has an active membership in AND
// 2. has selected via the workspace switcher (cookie), if any.
// If the cookie is unset or points to a workspace the user no longer has
// active membership in, fall back to the first-active-membership default
// (Phase 1 behavior).
export async function getActiveBusinessForUser(
  userId: string,
): Promise<ActiveBusinessSummary | null> {
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("business_memberships")
    .select("id, business_id, joined_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true, nullsFirst: false });

  if (!memberships || memberships.length === 0) return null;

  const selectedId = await readSelectedBusinessCookie();
  const preferred =
    (selectedId &&
      memberships.find((m) => m.business_id === selectedId)) ||
    memberships[0];
  if (!preferred) return null;

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, name, is_simulation")
    .eq("id", preferred.business_id)
    .single();

  if (!business) return null;

  const { data: roleRows } = await supabase
    .from("membership_roles")
    .select("role_id")
    .eq("membership_id", preferred.id)
    .limit(1);

  let roleName: string | null = null;
  let roleKey: string | null = null;
  const roleId = roleRows?.[0]?.role_id;
  if (roleId) {
    const { data: role } = await supabase
      .from("business_roles")
      .select("key, name")
      .eq("id", roleId)
      .single();
    if (role) {
      roleName = role.name;
      roleKey = role.key;
    }
  }

  const [{ count: appSurfacesCount }, { count: installedPluginsCount }] =
    await Promise.all([
      supabase
        .from("app_surfaces")
        .select("*", { count: "exact", head: true })
        .eq("business_id", business.id),
      supabase
        .from("installed_plugins")
        .select("*", { count: "exact", head: true })
        .eq("business_id", business.id),
    ]);

  return {
    id: business.id,
    slug: business.slug,
    name: business.name,
    isSimulation: Boolean(business.is_simulation),
    membershipId: preferred.id,
    roleName,
    roleKey,
    appSurfacesCount: appSurfacesCount ?? 0,
    installedPluginsCount: installedPluginsCount ?? 0,
  };
}
