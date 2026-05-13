import { readStagingToolsGate } from "@/core/staging-tools/env";

// Resolve the props every admin page passes to <AdminShell>. Keeps the
// staging-gate import out of each page and standardizes the shape.
// Server-only by virtue of reading process.env at call time.

export type AdminShellContext = {
  workspaceName: string;
  userEmail: string;
  stagingToolsEnabled: boolean;
};

export function resolveAdminShellContext(input: {
  workspaceName: string;
  userEmail: string;
}): AdminShellContext {
  const gate = readStagingToolsGate(process.env);
  return {
    workspaceName: input.workspaceName,
    userEmail: input.userEmail,
    stagingToolsEnabled: gate.publicEnabled,
  };
}
