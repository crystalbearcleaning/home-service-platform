import { createClient } from "@/core/auth/server";

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

export async function getActiveBusinessForUser(
  userId: string,
): Promise<ActiveBusinessSummary | null> {
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("business_memberships")
    .select("id, business_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true, nullsFirst: false })
    .limit(1);

  const membership = memberships?.[0];
  if (!membership) return null;

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, name, is_simulation")
    .eq("id", membership.business_id)
    .single();

  if (!business) return null;

  const { data: roleRows } = await supabase
    .from("membership_roles")
    .select("role_id")
    .eq("membership_id", membership.id)
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
    membershipId: membership.id,
    roleName,
    roleKey,
    appSurfacesCount: appSurfacesCount ?? 0,
    installedPluginsCount: installedPluginsCount ?? 0,
  };
}
