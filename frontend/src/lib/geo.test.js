import { describe, expect, it } from "vitest";

import {
  cumulativeDistances, currentStep, haversineMeters, projectOntoRoute,
  routeProgress, stepStartDistances,
} from "./geo";

// A simple straight line, about 1 metre of longitude per unit (near the
// equator rounding error is negligible for these distances), used so
// expected distances are easy to reason about: 4 points, 3 roughly-equal
// segments heading due east.
const LINE = [
  [76.0000, 10.0000],
  [76.0010, 10.0000],
  [76.0020, 10.0000],
  [76.0030, 10.0000],
];

describe("haversineMeters", () => {
  it("is zero for the same point", () => {
    expect(haversineMeters(10, 76, 10, 76)).toBe(0);
  });

  it("matches a known short real-world distance", () => {
    // 0.001 degrees of longitude at the equator is about 111 m.
    const metres = haversineMeters(0, 76.000, 0, 76.001);
    expect(metres).toBeGreaterThan(100);
    expect(metres).toBeLessThan(120);
  });
});

describe("cumulativeDistances", () => {
  it("starts at zero and is non-decreasing", () => {
    const cumulative = cumulativeDistances(LINE);
    expect(cumulative[0]).toBe(0);
    expect(cumulative.length).toBe(LINE.length);
    for (let i = 1; i < cumulative.length; i++) {
      expect(cumulative[i]).toBeGreaterThan(cumulative[i - 1]);
    }
  });
});

describe("projectOntoRoute", () => {
  it("returns null for an empty route", () => {
    expect(projectOntoRoute([], [], 10, 76)).toBeNull();
  });

  it("finds a point exactly on the line with ~zero perpendicular distance", () => {
    const cumulative = cumulativeDistances(LINE);
    const projection = projectOntoRoute(LINE, cumulative, 10.0000, 76.0015);

    expect(projection.distanceFromRouteM).toBeLessThan(1);
    expect(projection.distanceAlongM).toBeGreaterThan(cumulative[1]);
    expect(projection.distanceAlongM).toBeLessThan(cumulative[2]);
  });

  it("reports a real perpendicular distance for a point off the line", () => {
    // About 0.0005 deg north of the line, near its midpoint.
    const cumulative = cumulativeDistances(LINE);
    const projection = projectOntoRoute(LINE, cumulative, 10.0005, 76.0015);

    expect(projection.distanceFromRouteM).toBeGreaterThan(40);
    expect(projection.distanceFromRouteM).toBeLessThan(70);
  });

  it("clamps progress to the start when the position is behind the route", () => {
    const cumulative = cumulativeDistances(LINE);
    const projection = projectOntoRoute(LINE, cumulative, 10.0000, 75.9900);

    expect(projection.distanceAlongM).toBe(0);
  });

  it("clamps progress to the end when the position is past the route", () => {
    const cumulative = cumulativeDistances(LINE);
    const projection = projectOntoRoute(LINE, cumulative, 10.0000, 76.0100);

    expect(projection.distanceAlongM).toBeCloseTo(cumulative[cumulative.length - 1], 0);
  });
});

describe("routeProgress", () => {
  it("computes remaining distance, percent and a pace-based ETA", () => {
    const progress = routeProgress({ distanceAlongM: 2500 }, 5000, 10 /* min per km */);

    expect(progress.remainingM).toBe(2500);
    expect(progress.remainingKm).toBe(2.5);
    expect(progress.percent).toBe(50);
    expect(progress.etaMin).toBe(25);
  });

  it("never goes negative past the end of the route", () => {
    const progress = routeProgress({ distanceAlongM: 6000 }, 5000, 10);

    expect(progress.remainingM).toBe(0);
    expect(progress.percent).toBe(100);
  });

  it("handles a zero-length route without dividing by zero", () => {
    const progress = routeProgress({ distanceAlongM: 0 }, 0, 0);

    expect(progress.percent).toBe(0);
    expect(Number.isFinite(progress.etaMin)).toBe(true);
  });
});

describe("stepStartDistances / currentStep", () => {
  const steps = [
    { type: "depart", distance_m: 100 },
    { type: "turn", modifier: "left", distance_m: 200 },
    { type: "arrive", distance_m: 0 },
  ];

  it("computes cumulative start distances per step", () => {
    expect(stepStartDistances(steps)).toEqual([0, 100, 300]);
  });

  it("returns null when the route has no steps", () => {
    expect(currentStep([], [], 50)).toBeNull();
    expect(currentStep(undefined, [], 50)).toBeNull();
  });

  it("finds the upcoming maneuver and distance remaining to it", () => {
    const starts = stepStartDistances(steps);
    const result = currentStep(steps, starts, 40);

    expect(result.step.type).toBe("turn");
    expect(result.distanceToManeuverM).toBe(60);
    expect(result.isLast).toBe(false);
  });

  it("reaches the final (arrive) step once past every other maneuver", () => {
    const starts = stepStartDistances(steps);
    const result = currentStep(steps, starts, 350);

    expect(result.step.type).toBe("arrive");
    expect(result.isLast).toBe(true);
    expect(result.distanceToManeuverM).toBe(0);
  });
});
