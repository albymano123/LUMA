// Turn-by-turn instruction text from a real OSRM step (backend's
// routing_service.py _steps(), never discarded, never invented). A given
// (type, modifier) always produces the same templated phrase - this is a
// deterministic lookup against OSRM's own documented maneuver vocabulary
// (project-osrm.org), not a per-route guess, and does not require pulling
// in a turn-instruction library.

import {
  ArrowUp, ArrowUpLeft, ArrowUpRight, Flag, Navigation, RotateCw, Undo2,
} from "lucide-react";

const MODIFIER_TEXT = {
  uturn: "Make a U-turn",
  "sharp right": "Make a sharp right",
  right: "Turn right",
  "slight right": "Keep right",
  straight: "Continue straight",
  "slight left": "Keep left",
  left: "Turn left",
  "sharp left": "Make a sharp left",
};

const withRoad = (text, name) => (name ? `${text} onto ${name}` : text);

/** The full instruction sentence, e.g. "Turn left onto MG Road". */
export function instructionText(step) {
  if (!step) return "";

  const { type, modifier, name } = step;

  switch (type) {
    case "depart":
      return name ? `Head out on ${name}` : "Head out";
    case "arrive":
      return "Arrive at destination";
    case "turn":
    case "end of road":
    case "fork":
      return withRoad(MODIFIER_TEXT[modifier] || "Continue", name);
    case "new name":
      return name ? `Continue onto ${name}` : "Continue straight";
    case "continue":
      return withRoad(MODIFIER_TEXT[modifier] || "Continue straight", name);
    case "merge":
      return withRoad("Merge", name);
    case "on ramp":
      return "Take the ramp";
    case "off ramp":
      return withRoad("Take the exit", name);
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      return "Enter the roundabout";
    case "exit roundabout":
    case "exit rotary":
      return withRoad("Exit the roundabout", name);
    case "use lane":
      return "Stay in lane";
    default:
      return withRoad(MODIFIER_TEXT[modifier] || "Continue", name);
  }
}

/** A short word or two for compact display, e.g. "Turn left". */
export function instructionShort(step) {
  if (!step) return "";
  if (step.type === "depart") return "Head out";
  if (step.type === "arrive") return "Arrive";

  return MODIFIER_TEXT[step.modifier] || "Continue";
}

// Which lucide-react icon fits a maneuver, for a compact direction glyph
// next to the instruction text. Plain lookup tables (as lib/risk.js's
// `Icon` fields are), so a component resolves by property access at the
// call site rather than by a function call returning a component.
export const TYPE_ICON = {
  depart: Navigation,
  arrive: Flag,
  roundabout: RotateCw,
  rotary: RotateCw,
  "roundabout turn": RotateCw,
};

export const MODIFIER_ICON = {
  uturn: Undo2,
  "sharp right": ArrowUpRight,
  right: ArrowUpRight,
  "slight right": ArrowUpRight,
  straight: ArrowUp,
  "slight left": ArrowUpLeft,
  left: ArrowUpLeft,
  "sharp left": ArrowUpLeft,
};

export const DEFAULT_INSTRUCTION_ICON = Navigation;
