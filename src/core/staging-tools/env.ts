// Pure helpers around the staging-tools env gate. Split out so the
// gate logic is unit-testable without touching real process.env.

export function parseBooleanFlag(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

export type StagingToolsGate = {
  publicEnabled: boolean;
  serverEnabled: boolean;
  bothEnabled: boolean;
};

export function readStagingToolsGate(
  env: Record<string, string | undefined>,
): StagingToolsGate {
  const publicEnabled = parseBooleanFlag(
    env.NEXT_PUBLIC_ENABLE_STAGING_TOOLS,
  );
  const serverEnabled = parseBooleanFlag(env.ENABLE_STAGING_TOOLS);
  return {
    publicEnabled,
    serverEnabled,
    bothEnabled: publicEnabled && serverEnabled,
  };
}

// Server-side check. Both flags must be true so a leaked public flag
// alone cannot trigger destructive actions.
export function isStagingResetAllowed(
  env: Record<string, string | undefined>,
): boolean {
  return readStagingToolsGate(env).serverEnabled;
}
