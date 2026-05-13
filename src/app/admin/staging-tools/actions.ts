"use server";

import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { isStagingResetAllowed } from "@/core/staging-tools/env";
import {
  executeStagingReset,
  type ResetResult,
} from "@/core/staging-tools/reset";

// =========================================================================
// Public server action for the staging reset button. Gated by:
//   1. Server env flag ENABLE_STAGING_TOOLS=true
//   2. Authenticated user
//   3. Active business membership
//
// We do not trust the NEXT_PUBLIC_ENABLE_STAGING_TOOLS flag here — that
// one only governs UI visibility. The server-side flag is the only thing
// that actually unlocks the destructive path.
// =========================================================================

export type ResetActionInput = {
  // Plain confirmation string the UI requires before posting. The
  // server re-checks it so a buggy / malicious caller cannot skip the
  // confirmation step.
  confirmation: string;
};

export type ResetActionResult =
  | { ok: true; data: { businessId: string; counts: Record<string, number> } }
  | {
      ok: false;
      error: { code: string; message: string; details?: unknown };
    };

// Must match REQUIRED_CONFIRMATION in the client (`page.tsx`). Server
// re-checks so a buggy / malicious caller cannot skip the confirmation.
const REQUIRED_CONFIRMATION = "RESET QUOTE FLOW DATA";

export async function resetStagingDataAction(
  input: ResetActionInput,
): Promise<ResetActionResult> {
  try {
    // 1. Server-side env gate.
    if (!isStagingResetAllowed(process.env)) {
      return {
        ok: false,
        error: {
          code: "STAGING_TOOLS_DISABLED",
          message:
            "Staging reset is disabled. ENABLE_STAGING_TOOLS must be true on the server.",
        },
      };
    }

    // 2. Confirmation string must match.
    if ((input?.confirmation ?? "").trim() !== REQUIRED_CONFIRMATION) {
      return {
        ok: false,
        error: {
          code: "CONFIRMATION_MISMATCH",
          message: `Confirmation string must be exactly "${REQUIRED_CONFIRMATION}".`,
        },
      };
    }

    // 3. Authenticated admin.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Sign in required." },
      };
    }

    // 4. Active business membership.
    const business = await getActiveBusinessForUser(user.id);
    if (!business) {
      return {
        ok: false,
        error: {
          code: "NO_ACTIVE_BUSINESS",
          message: "No active business membership for this user.",
        },
      };
    }

    // 5. Execute.
    const result: ResetResult = await executeStagingReset({
      businessId: business.id,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
      };
    }

    return {
      ok: true,
      data: {
        businessId: result.data.businessId,
        counts: result.data.counts as unknown as Record<string, number>,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[resetStagingDataAction] unhandled error:", message, stack);
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: `Staging reset failed unexpectedly: ${message}`,
      },
    };
  }
}

