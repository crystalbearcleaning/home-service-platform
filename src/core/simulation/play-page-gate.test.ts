import { describe, expect, it } from "vitest";

import {
  computeSessionProgress,
  resolvePlayPageGate,
} from "./play-page-gate";

describe("resolvePlayPageGate", () => {
  it("returns not_simulation_workspace when the active business is real", () => {
    const gate = resolvePlayPageGate({
      business: { name: "Crystal Bear Window Cleaning", isSimulation: false },
      activeRunId: "any",
    });
    expect(gate).toEqual({
      kind: "not_simulation_workspace",
      businessName: "Crystal Bear Window Cleaning",
    });
  });

  it("returns no_active_save when sim workspace has no active run", () => {
    const gate = resolvePlayPageGate({
      business: { name: "Crystal Bear Simulation", isSimulation: true },
      activeRunId: null,
    });
    expect(gate).toEqual({
      kind: "no_active_save",
      businessName: "Crystal Bear Simulation",
    });
  });

  it("treats undefined activeRunId as no_active_save", () => {
    const gate = resolvePlayPageGate({
      business: { name: "Crystal Bear Simulation", isSimulation: true },
      activeRunId: undefined,
    });
    expect(gate.kind).toBe("no_active_save");
  });

  it("treats empty-string activeRunId as no_active_save", () => {
    const gate = resolvePlayPageGate({
      business: { name: "Crystal Bear Simulation", isSimulation: true },
      activeRunId: "",
    });
    expect(gate.kind).toBe("no_active_save");
  });

  it("returns play when sim workspace + active run id are present", () => {
    const gate = resolvePlayPageGate({
      business: { name: "Crystal Bear Simulation", isSimulation: true },
      activeRunId: "run-1",
    });
    expect(gate).toEqual({
      kind: "play",
      businessName: "Crystal Bear Simulation",
      activeRunId: "run-1",
    });
  });

  it("real workspace + active run still gates to not_simulation_workspace (sim flag wins)", () => {
    const gate = resolvePlayPageGate({
      business: { name: "Crystal Bear Window Cleaning", isSimulation: false },
      activeRunId: "run-1",
    });
    expect(gate.kind).toBe("not_simulation_workspace");
  });
});

describe("computeSessionProgress", () => {
  it("uses total route stops when route stops exist", () => {
    const p = computeSessionProgress({
      hangersDistributed: 25,
      routeHasStops: true,
      totalRouteStops: 100,
      targetHomeCount: 999, // ignored when routeHasStops is true
    });
    expect(p).toEqual({
      hangersDistributed: 25,
      remainingHangers: 75,
      totalHangers: 100,
      percentDistributed: 25,
    });
  });

  it("falls back to target home count when no route stops exist", () => {
    const p = computeSessionProgress({
      hangersDistributed: 5,
      routeHasStops: false,
      totalRouteStops: 0,
      targetHomeCount: 50,
    });
    expect(p).toEqual({
      hangersDistributed: 5,
      remainingHangers: 45,
      totalHangers: 50,
      percentDistributed: 10,
    });
  });

  it("returns null when no stops and no target", () => {
    expect(
      computeSessionProgress({
        hangersDistributed: 5,
        routeHasStops: false,
        totalRouteStops: 0,
        targetHomeCount: null,
      }),
    ).toBeNull();
  });

  it("zero total surfaces a 0% progress without dividing by zero", () => {
    const p = computeSessionProgress({
      hangersDistributed: 0,
      routeHasStops: true,
      totalRouteStops: 0,
      targetHomeCount: null,
    });
    expect(p).toEqual({
      hangersDistributed: 0,
      remainingHangers: 0,
      totalHangers: 0,
      percentDistributed: 0,
    });
  });

  it("caps percent at 100 even when distributed exceeds total", () => {
    const p = computeSessionProgress({
      hangersDistributed: 120,
      routeHasStops: true,
      totalRouteStops: 100,
      targetHomeCount: null,
    });
    expect(p?.percentDistributed).toBe(100);
    expect(p?.remainingHangers).toBe(0);
  });

  it("clamps negative / non-finite inputs to zero", () => {
    const p = computeSessionProgress({
      hangersDistributed: -5,
      routeHasStops: true,
      totalRouteStops: 50,
      targetHomeCount: null,
    });
    expect(p?.hangersDistributed).toBe(0);
    expect(p?.remainingHangers).toBe(50);
    expect(p?.percentDistributed).toBe(0);

    const p2 = computeSessionProgress({
      hangersDistributed: Number.NaN,
      routeHasStops: true,
      totalRouteStops: 10,
      targetHomeCount: null,
    });
    expect(p2?.hangersDistributed).toBe(0);
  });
});
