import { describe, expect, it } from "vitest";
import {
  automationMatches,
  filterAutomations,
  tokenizeSearch,
} from "./admin-search";

const ROWS = [
  {
    automationKey: "schedule_request",
    name: "Schedule Request",
    description: "A lead requests to schedule.",
  },
  {
    automationKey: "manual_quote_needed",
    name: "Manual Quote Needed",
    description: "A property could not be quoted automatically.",
  },
  {
    automationKey: "service_area_review",
    name: "Service Area Review",
    description: "A lead is outside the normal service area.",
  },
];

describe("tokenizeSearch", () => {
  it("returns an empty array for null / undefined / empty", () => {
    expect(tokenizeSearch(null)).toEqual([]);
    expect(tokenizeSearch(undefined)).toEqual([]);
    expect(tokenizeSearch("")).toEqual([]);
    expect(tokenizeSearch("   ")).toEqual([]);
  });
  it("lowercases and splits on whitespace", () => {
    expect(tokenizeSearch("Manual  Quote")).toEqual(["manual", "quote"]);
  });
});

describe("automationMatches", () => {
  it("returns true for empty tokens (no filter)", () => {
    expect(automationMatches(ROWS[0]!, [])).toBe(true);
  });
  it("matches against name", () => {
    expect(automationMatches(ROWS[0]!, ["schedule"])).toBe(true);
  });
  it("matches against automation_key", () => {
    expect(automationMatches(ROWS[1]!, ["manual_quote"])).toBe(true);
  });
  it("matches against description", () => {
    expect(automationMatches(ROWS[2]!, ["outside"])).toBe(true);
  });
  it("requires all tokens to match (AND semantics)", () => {
    expect(automationMatches(ROWS[0]!, ["schedule", "lead"])).toBe(true);
    expect(automationMatches(ROWS[0]!, ["schedule", "outside"])).toBe(false);
  });
});

describe("filterAutomations", () => {
  it("returns the full list when query is empty", () => {
    expect(filterAutomations(ROWS, "")).toHaveLength(3);
    expect(filterAutomations(ROWS, null)).toHaveLength(3);
  });
  it("filters by description text", () => {
    const r = filterAutomations(ROWS, "outside");
    expect(r.map((x) => x.automationKey)).toEqual(["service_area_review"]);
  });
  it("filters by automation_key", () => {
    const r = filterAutomations(ROWS, "manual_quote");
    expect(r.map((x) => x.automationKey)).toEqual(["manual_quote_needed"]);
  });
  it("returns empty when no match", () => {
    expect(filterAutomations(ROWS, "zzznope")).toEqual([]);
  });
});
