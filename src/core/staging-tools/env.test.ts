import { describe, expect, it } from "vitest";
import {
  isStagingResetAllowed,
  parseBooleanFlag,
  readStagingToolsGate,
} from "./env";

describe("parseBooleanFlag", () => {
  it("returns true only for truthy strings", () => {
    expect(parseBooleanFlag("true")).toBe(true);
    expect(parseBooleanFlag("TRUE")).toBe(true);
    expect(parseBooleanFlag("True")).toBe(true);
    expect(parseBooleanFlag("1")).toBe(true);
    expect(parseBooleanFlag("yes")).toBe(true);
    expect(parseBooleanFlag("on")).toBe(true);
  });

  it("returns false for anything else", () => {
    expect(parseBooleanFlag(undefined)).toBe(false);
    expect(parseBooleanFlag(null)).toBe(false);
    expect(parseBooleanFlag("")).toBe(false);
    expect(parseBooleanFlag("false")).toBe(false);
    expect(parseBooleanFlag("0")).toBe(false);
    expect(parseBooleanFlag("no")).toBe(false);
    expect(parseBooleanFlag("off")).toBe(false);
    expect(parseBooleanFlag(" maybe ")).toBe(false);
  });
});

describe("readStagingToolsGate", () => {
  it("returns both-false when nothing is set", () => {
    const g = readStagingToolsGate({});
    expect(g.publicEnabled).toBe(false);
    expect(g.serverEnabled).toBe(false);
    expect(g.bothEnabled).toBe(false);
  });

  it("returns publicEnabled only when only the public flag is set", () => {
    const g = readStagingToolsGate({
      NEXT_PUBLIC_ENABLE_STAGING_TOOLS: "true",
    });
    expect(g.publicEnabled).toBe(true);
    expect(g.serverEnabled).toBe(false);
    expect(g.bothEnabled).toBe(false);
  });

  it("returns serverEnabled only when only the server flag is set", () => {
    const g = readStagingToolsGate({
      ENABLE_STAGING_TOOLS: "true",
    });
    expect(g.publicEnabled).toBe(false);
    expect(g.serverEnabled).toBe(true);
    expect(g.bothEnabled).toBe(false);
  });

  it("bothEnabled requires both flags", () => {
    const g = readStagingToolsGate({
      NEXT_PUBLIC_ENABLE_STAGING_TOOLS: "true",
      ENABLE_STAGING_TOOLS: "true",
    });
    expect(g.bothEnabled).toBe(true);
  });
});

describe("isStagingResetAllowed", () => {
  it("returns true ONLY when the server flag is true", () => {
    expect(isStagingResetAllowed({})).toBe(false);
    expect(
      isStagingResetAllowed({ NEXT_PUBLIC_ENABLE_STAGING_TOOLS: "true" }),
    ).toBe(false);
    expect(isStagingResetAllowed({ ENABLE_STAGING_TOOLS: "true" })).toBe(true);
    expect(
      isStagingResetAllowed({
        ENABLE_STAGING_TOOLS: "true",
        NEXT_PUBLIC_ENABLE_STAGING_TOOLS: "false",
      }),
    ).toBe(true);
  });

  it("ignores the public flag when deciding action access", () => {
    // Leaked public flag alone must not unlock the destructive path.
    expect(
      isStagingResetAllowed({ NEXT_PUBLIC_ENABLE_STAGING_TOOLS: "true" }),
    ).toBe(false);
  });
});
