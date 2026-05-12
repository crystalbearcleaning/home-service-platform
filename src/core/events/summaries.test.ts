import { describe, it, expect } from "vitest";
import {
  phase1EventTypeSummaries,
  summarizePhase1Event,
} from "./summaries";
import { phase1EventTypes } from "./types";

describe("phase 1 event summaries", () => {
  it("has a summary for every phase 1 event type", () => {
    for (const type of phase1EventTypes) {
      expect(phase1EventTypeSummaries[type]).toBeTruthy();
    }
  });

  it("maps known types via summarize helper", () => {
    expect(summarizePhase1Event("lead.created")).toBe("Lead created.");
    expect(summarizePhase1Event("quote_app.address_entered")).toBe(
      "Visitor entered an address.",
    );
    expect(summarizePhase1Event("issue.flagged")).toBe("Issue flagged.");
  });

  it("falls back to a deburred string for unknown types", () => {
    expect(summarizePhase1Event("foo.bar")).toBe("foo bar");
    expect(summarizePhase1Event("custom_event")).toBe("custom event");
  });
});
