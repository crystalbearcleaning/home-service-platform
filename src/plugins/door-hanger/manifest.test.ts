import { describe, expect, it } from "vitest";
import {
  DOOR_HANGER_CAMPAIGN_STATUSES,
  DOOR_HANGER_PLUGIN,
  DOOR_HANGER_ROUTES,
  DOOR_HANGER_ROUTE_SOURCES,
  DOOR_HANGER_ROUTE_STATUSES,
  DOOR_HANGER_ROUTE_STOP_STATUSES,
  DOOR_HANGER_SESSION_MODES,
} from "./manifest";

describe("Door Hanger plugin identity", () => {
  it("has the expected plugin key + initial version", () => {
    expect(DOOR_HANGER_PLUGIN.pluginKey).toBe("door_hanger");
    expect(DOOR_HANGER_PLUGIN.version).toBe("0.1.0");
  });

  it("dashboard route lives under /admin/marketing/door-hangers", () => {
    expect(DOOR_HANGER_ROUTES.dashboard).toBe(
      "/admin/marketing/door-hangers",
    );
  });
});

describe("Door Hanger schema taxonomies (must mirror the migration CHECKs)", () => {
  it("campaign statuses", () => {
    expect([...DOOR_HANGER_CAMPAIGN_STATUSES].sort()).toEqual(
      ["active", "complete", "draft", "paused"].sort(),
    );
  });
  it("route statuses", () => {
    expect([...DOOR_HANGER_ROUTE_STATUSES].sort()).toEqual(
      ["completed", "draft", "in_progress", "paused", "ready"].sort(),
    );
  });
  it("route-stop statuses", () => {
    expect([...DOOR_HANGER_ROUTE_STOP_STATUSES].sort()).toEqual(
      ["completed", "pending", "skipped"].sort(),
    );
  });
  it("route generation sources", () => {
    expect([...DOOR_HANGER_ROUTE_SOURCES].sort()).toEqual(
      ["manual", "rentcast"].sort(),
    );
  });
  it("session modes", () => {
    expect([...DOOR_HANGER_SESSION_MODES].sort()).toEqual(
      ["real", "simulated"].sort(),
    );
  });
});
