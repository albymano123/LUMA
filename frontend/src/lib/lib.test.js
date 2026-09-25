import { afterEach, describe, expect, it, vi } from "vitest";

import { canRun3D } from "./capabilities";
import {
  formatDistance,
  formatDuration,
  formatHours,
  formatMetres,
  formatRiskLevel,
} from "./format";
import { CONFIDENCE, riskInfo, scoreTone } from "./risk";
import { describeWeather } from "./weather";

describe("format", () => {
  it("formats durations", () => {
    expect(formatDuration(null)).toBe("–");
    expect(formatDuration(0.2)).toBe("1 min");
    expect(formatDuration(45.4)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(121)).toBe("2 h 1 min");
  });

  it("formats distances", () => {
    expect(formatDistance(null)).toBe("–");
    expect(formatDistance(0.45)).toBe("450 m");
    expect(formatDistance(4.63)).toBe("4.6 km");
    expect(formatDistance(27.3)).toBe("27 km");
  });

  it("formats short distances to services", () => {
    expect(formatMetres(null)).toBe("–");
    expect(formatMetres(304)).toBe("300 m");
    expect(formatMetres(1520)).toBe("1.5 km");
  });

  it("shows opening hours exactly as mapped, never reinterpreted", () => {
    expect(formatHours(null)).toBeNull();
    expect(formatHours("24/7")).toBe("Open 24 hours");
    expect(formatHours(" Mo-Sa 09:00-17:00 ")).toBe("Mo-Sa 09:00-17:00");
  });

  it("uses the backend's wording for risk levels", () => {
    expect(formatRiskLevel("Lower risk")).toBe("Lower risk");
    expect(formatRiskLevel(undefined)).toBe("Insufficient data");
  });
});

describe("risk", () => {
  it("maps every level the backend can send to a tone, an icon and words", () => {
    for (const level of ["Lower risk", "Moderate risk", "Higher risk", "Insufficient data"]) {
      const info = riskInfo(level);

      expect(info.tone).toBeTruthy();
      expect(info.Icon).toBeTruthy();
      expect(info.short).toBe(level);
    }
  });

  it("treats an unknown level as insufficient data, never as safe", () => {
    expect(riskInfo("Totally safe")).toBe(riskInfo("Insufficient data"));
    expect(riskInfo("Totally safe").tone).toBe("neutral");
  });

  it("colours factor values with the same thresholds as the risk levels", () => {
    expect(scoreTone(75)).toBe("positive");
    expect(scoreTone(74)).toBe("warning");
    expect(scoreTone(55)).toBe("warning");
    expect(scoreTone(54)).toBe("danger");
    expect(scoreTone(null)).toBe("neutral");
  });

  it("explains every confidence level", () => {
    for (const level of ["high", "medium", "low"]) {
      expect(CONFIDENCE[level].label).toMatch(/confidence/);
      expect(CONFIDENCE[level].help.length).toBeGreaterThan(20);
    }
  });
});

describe("weather", () => {
  it("names conditions from WMO codes", () => {
    expect(describeWeather(0, true)).toEqual({ label: "Clear sky", kind: "clear" });
    expect(describeWeather(0, false).label).toBe("Clear night");
    expect(describeWeather(2).kind).toBe("partly");
    expect(describeWeather(3).kind).toBe("cloudy");
    expect(describeWeather(45).kind).toBe("fog");
    expect(describeWeather(53).kind).toBe("drizzle");
    expect(describeWeather(65).kind).toBe("rain");
    expect(describeWeather(81).kind).toBe("rain");
    expect(describeWeather(73).kind).toBe("snow");
    expect(describeWeather(96).kind).toBe("storm");
  });

  it("reports missing weather as unavailable, not as clear", () => {
    expect(describeWeather(null)).toEqual({ label: "Conditions unavailable", kind: "unknown" });
    expect(describeWeather(undefined).kind).toBe("unknown");
  });
});

describe("capabilities (when the 3D hero is worth it)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function environment({ webgl = true, reduced = false, connection, memory, cores } = {}) {
    vi.stubGlobal("matchMedia", (query) => ({ matches: reduced && /reduce/.test(query), media: query }));
    vi.stubGlobal("WebGLRenderingContext", webgl ? function WebGL() {} : undefined);
    vi.spyOn(document, "createElement").mockImplementation((tag) =>
      tag === "canvas" ? { getContext: () => (webgl ? {} : null) } : document.createElementNS("http://www.w3.org/1999/xhtml", tag)
    );
    Object.defineProperty(navigator, "connection", { value: connection, configurable: true });
    Object.defineProperty(navigator, "deviceMemory", { value: memory, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { value: cores ?? 8, configurable: true });
  }

  it("allows 3D on a capable device", () => {
    environment();
    expect(canRun3D()).toBe(true);
  });

  it("falls back without WebGL", () => {
    environment({ webgl: false });
    expect(canRun3D()).toBe(false);
  });

  it("respects reduced motion", () => {
    environment({ reduced: true });
    expect(canRun3D()).toBe(false);
  });

  it("respects data saver and slow connections", () => {
    environment({ connection: { saveData: true } });
    expect(canRun3D()).toBe(false);

    environment({ connection: { effectiveType: "3g" } });
    expect(canRun3D()).toBe(false);
  });

  it("falls back on very low-end hardware", () => {
    environment({ memory: 1 });
    expect(canRun3D()).toBe(false);

    environment({ cores: 2 });
    expect(canRun3D()).toBe(false);
  });
});
