import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSafeRoute } from "../../services/api";
import { useNavigation } from "./useNavigation";

vi.mock("../../services/api", () => ({ getSafeRoute: vi.fn() }));

// A short, real-shaped straight route heading east, with one real step.
const ROUTE = {
  id: "route-1",
  categories: ["safest"],
  distance_km: 1.0,
  duration_min: 12,
  geometry: {
    type: "LineString",
    coordinates: [
      [76.0000, 10.0000],
      [76.0050, 10.0000],
      [76.0100, 10.0000],
    ],
  },
  steps: [
    { type: "depart", modifier: null, name: "", distance_m: 500, location: [76.0000, 10.0000] },
    { type: "turn", modifier: "left", name: "Side Road", distance_m: 500, location: [76.0050, 10.0000] },
    { type: "arrive", modifier: null, name: "", distance_m: 0, location: [76.0100, 10.0000] },
  ],
};

const DESTINATION = { lat: 10.0000, lon: 76.0100, name: "Destination" };

let capturedOnPosition;
let capturedOnError;
let watchId = 0;

function fireGpsFix(lat, lon, accuracy = 10) {
  act(() => {
    capturedOnPosition({ coords: { latitude: lat, longitude: lon, accuracy, heading: null, speed: null } });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T09:00:00Z"));

  capturedOnPosition = undefined;
  capturedOnError = undefined;

  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((onPosition, onError) => {
        capturedOnPosition = onPosition;
        capturedOnError = onError;
        return ++watchId;
      }),
      clearWatch: vi.fn(),
    },
  });

  getSafeRoute.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useNavigation", () => {
  it("is idle until start() is called", () => {
    const { result } = renderHook(() => useNavigation());

    expect(result.current.active).toBe(false);
    expect(result.current.route).toBeNull();
  });

  it("start() activates navigation and begins a real geolocation watch", () => {
    const { result } = renderHook(() => useNavigation());

    act(() => result.current.start(ROUTE, DESTINATION, "walking"));

    expect(result.current.active).toBe(true);
    expect(result.current.route.id).toBe("route-1");
    expect(globalThis.navigator.geolocation.watchPosition).toHaveBeenCalledTimes(1);
  });

  it("updates progress and the upcoming instruction from a real GPS fix", () => {
    const { result } = renderHook(() => useNavigation());
    act(() => result.current.start(ROUTE, DESTINATION, "walking"));

    // Halfway along the first (500 m) leg.
    fireGpsFix(10.0000, 76.0025);

    expect(result.current.progress.remainingKm).toBeGreaterThan(0.6);
    expect(result.current.progress.remainingKm).toBeLessThan(0.9);
    expect(result.current.progress.percent).toBeGreaterThan(20);
    expect(result.current.progress.percent).toBeLessThan(35);
    expect(result.current.instruction.step.type).toBe("turn");
    expect(result.current.deviation).toBe("on-route");
  });

  it("stays on-route for fixes inside the deviation threshold", () => {
    const { result } = renderHook(() => useNavigation());
    act(() => result.current.start(ROUTE, DESTINATION, "walking"));

    fireGpsFix(10.00005, 76.0020); // a few metres off the line
    expect(result.current.deviation).toBe("on-route");
  });

  it("does not reroute on a single far-off reading (no sustained deviation)", () => {
    const { result } = renderHook(() => useNavigation());
    act(() => result.current.start(ROUTE, DESTINATION, "walking"));

    fireGpsFix(10.01, 76.0020); // far from the route
    expect(result.current.deviation).toBe("deviating");
    expect(getSafeRoute).not.toHaveBeenCalled();
    expect(result.current.route.id).toBe("route-1");
  });

  it("reroutes through the existing getSafeRoute pipeline after sustained deviation", async () => {
    const rerouted = {
      routes: [{ ...ROUTE, id: "route-2", categories: ["safest"] }],
      default_route_id: "route-2",
      recommended_route_id: "route-2",
    };
    getSafeRoute.mockResolvedValue(rerouted);

    const onRerouted = vi.fn();
    const { result } = renderHook(() => useNavigation({ onRerouted }));
    act(() => result.current.start(ROUTE, DESTINATION, "walking"));

    fireGpsFix(10.01, 76.0020);
    expect(result.current.deviation).toBe("deviating");

    // Still off the route, 9 s later: past the 8 s sustained threshold.
    act(() => vi.advanceTimersByTime(9000));
    fireGpsFix(10.01, 76.0021);

    expect(result.current.deviation).toBe("off-route");
    expect(getSafeRoute).toHaveBeenCalledTimes(1);

    const [source, destination, mode] = getSafeRoute.mock.calls[0];
    expect(source.lat).toBeCloseTo(10.01, 3);
    expect(destination).toBe(DESTINATION);
    expect(mode).toBe("walking");

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(result.current.route.id).toBe("route-2");
    expect(onRerouted).toHaveBeenCalledWith(rerouted, "route-2");
    expect(result.current.rerouting).toBe(false);
  });

  it("keeps the existing route and reports an error when rerouting fails", async () => {
    getSafeRoute.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useNavigation());
    act(() => result.current.start(ROUTE, DESTINATION, "walking"));

    fireGpsFix(10.01, 76.0020);
    act(() => vi.advanceTimersByTime(9000));
    fireGpsFix(10.01, 76.0021);

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(result.current.route.id).toBe("route-1"); // unchanged
    expect(result.current.rerouteError).toMatch(/network down/);
    expect(result.current.active).toBe(true); // navigation state not destroyed
  });

  it("detects arrival near the destination and stops tracking", () => {
    const { result } = renderHook(() => useNavigation());
    act(() => result.current.start(ROUTE, DESTINATION, "walking"));

    fireGpsFix(10.0000, 76.00999); // a few metres from the destination

    expect(result.current.arrived).toBe(true);
  });

  it("stop() clears the real geolocation watch and resets state", () => {
    const { result } = renderHook(() => useNavigation());
    act(() => result.current.start(ROUTE, DESTINATION, "walking"));
    const id = globalThis.navigator.geolocation.watchPosition.mock.results[0].value;

    act(() => result.current.stop());

    expect(result.current.active).toBe(false);
    expect(result.current.route).toBeNull();
    expect(globalThis.navigator.geolocation.clearWatch).toHaveBeenCalledWith(id);
  });

  it("reports permission-denied without crashing", () => {
    const { result } = renderHook(() => useNavigation());
    act(() => result.current.start(ROUTE, DESTINATION, "walking"));

    act(() => capturedOnError({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 }));

    expect(result.current.locationStatus).toBe("denied");
    expect(result.current.locationError).toBeTruthy();
    expect(result.current.active).toBe(true); // navigation mode itself is not torn down
  });
});
