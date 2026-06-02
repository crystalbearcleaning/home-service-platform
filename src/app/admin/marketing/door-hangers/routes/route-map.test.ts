import { describe, expect, it } from "vitest";

import { resolveSelectedRouteId } from "./route-map";

describe("resolveSelectedRouteId", () => {
  const routes = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns null when no id is requested", () => {
    expect(resolveSelectedRouteId(routes, null)).toBeNull();
  });

  it("returns the requested id when it exists", () => {
    expect(resolveSelectedRouteId(routes, "b")).toBe("b");
  });

  it("returns null when the requested id is not present", () => {
    expect(resolveSelectedRouteId(routes, "z")).toBeNull();
  });

  it("returns null when the routes list is empty", () => {
    expect(resolveSelectedRouteId([], "a")).toBeNull();
  });
});
