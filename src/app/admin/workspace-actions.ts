"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/auth/server";
import {
  clearSelectedBusinessCookie,
  isValidBusinessIdCandidate,
  writeSelectedBusinessCookie,
} from "@/core/business/workspace-selection";

// Phase 6D — workspace switcher server action.
// Writes the selected-business cookie after confirming the user has an
// active membership in that workspace. RLS already prevents cross-
// workspace reads, but verifying membership here gives the user a
// clear error if they try to switch into a workspace they don't belong
// to (e.g. stale link).

export type SwitchWorkspaceResult =
  | { ok: true }
  | { ok: false; error: { code: string; message: string } };

export async function setActiveWorkspaceAction(input: {
  businessId: string;
}): Promise<SwitchWorkspaceResult> {
  if (!isValidBusinessIdCandidate(input.businessId)) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Invalid workspace id." },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Sign-in required." },
    };
  }

  const { data: membership } = await supabase
    .from("business_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("business_id", input.businessId)
    .eq("status", "active")
    .limit(1);

  if (!membership || membership.length === 0) {
    return {
      ok: false,
      error: {
        code: "NO_MEMBERSHIP",
        message: "You are not an active member of that workspace.",
      },
    };
  }

  await writeSelectedBusinessCookie(input.businessId);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function clearActiveWorkspaceAction(): Promise<SwitchWorkspaceResult> {
  await clearSelectedBusinessCookie();
  revalidatePath("/admin", "layout");
  return { ok: true };
}
