import { describe, expect, it } from "vitest";

import { Flag } from "lucide-react";

import {
  DEFAULT_INSTRUCTION_ICON, MODIFIER_ICON, TYPE_ICON, instructionShort, instructionText,
} from "./maneuvers";

const iconFor = (step) => (step && (TYPE_ICON[step.type] || MODIFIER_ICON[step.modifier])) || DEFAULT_INSTRUCTION_ICON;

describe("instructionText", () => {
  it("handles an empty step without throwing", () => {
    expect(instructionText(null)).toBe("");
    expect(instructionText(undefined)).toBe("");
  });

  it("describes departure, naming the road when known", () => {
    expect(instructionText({ type: "depart", name: "" })).toBe("Head out");
    expect(instructionText({ type: "depart", name: "MG Road" })).toBe("Head out on MG Road");
  });

  it("describes arrival the same way regardless of road name", () => {
    expect(instructionText({ type: "arrive", name: "" })).toBe("Arrive at destination");
  });

  it("maps every real OSRM turn modifier to a real phrase", () => {
    const cases = {
      uturn: "Make a U-turn",
      "sharp right": "Make a sharp right",
      right: "Turn right",
      "slight right": "Keep right",
      straight: "Continue straight",
      "slight left": "Keep left",
      left: "Turn left",
      "sharp left": "Make a sharp left",
    };

    for (const [modifier, expected] of Object.entries(cases)) {
      expect(instructionText({ type: "turn", modifier, name: "" })).toBe(expected);
    }
  });

  it("appends the road name to a turn when one is mapped", () => {
    expect(instructionText({ type: "turn", modifier: "left", name: "Pandit Karuppan Road" }))
      .toBe("Turn left onto Pandit Karuppan Road");
  });

  it("describes a road-name change as continuing", () => {
    expect(instructionText({ type: "new name", name: "South Panampilly Nagar Road" }))
      .toBe("Continue onto South Panampilly Nagar Road");
    expect(instructionText({ type: "new name", name: "" })).toBe("Continue straight");
  });

  it("falls back to a reasonable phrase for an unrecognised maneuver type", () => {
    expect(instructionText({ type: "something-new", modifier: "left", name: "" })).toBe("Turn left");
    expect(instructionText({ type: "something-new", modifier: undefined, name: "" })).toBe("Continue");
  });
});

describe("instructionShort", () => {
  it("is a compact word for display", () => {
    expect(instructionShort({ type: "depart" })).toBe("Head out");
    expect(instructionShort({ type: "arrive" })).toBe("Arrive");
    expect(instructionShort({ type: "turn", modifier: "right" })).toBe("Turn right");
  });

  it("handles a missing step", () => {
    expect(instructionShort(null)).toBe("");
  });
});

describe("icon lookup tables (TYPE_ICON / MODIFIER_ICON)", () => {
  it("never returns nothing, even for an unknown shape", () => {
    expect(iconFor(null)).toBeTruthy();
    expect(iconFor({ type: "turn", modifier: "left" })).toBeTruthy();
    expect(iconFor({ type: "arrive" })).toBe(Flag);
  });
});
