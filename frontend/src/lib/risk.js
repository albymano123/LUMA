import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert } from "lucide-react";

// How each risk level looks. The backend decides the level; the UI only
// maps it to a tone, an icon and a word, so safety is never conveyed by
// colour alone.
const LEVELS = {
  "Lower risk": { tone: "positive", Icon: CheckCircle2, short: "Lower risk" },
  "Moderate risk": { tone: "warning", Icon: AlertTriangle, short: "Moderate risk" },
  "Higher risk": { tone: "danger", Icon: ShieldAlert, short: "Higher risk" },
  "Insufficient data": { tone: "neutral", Icon: HelpCircle, short: "Insufficient data" },
};

export function riskInfo(level) {
  return LEVELS[level] ?? LEVELS["Insufficient data"];
}

export const CONFIDENCE = {
  high: { label: "High confidence", help: "All the main safety data sources were available for this route." },
  medium: { label: "Medium confidence", help: "Some safety data was unavailable, so the score is based on fewer factors." },
  low: { label: "Low confidence", help: "Much of the safety data was unavailable. Treat this score with caution." },
};

// Colour of a 0-100 factor value, matching the risk thresholds.
export function scoreTone(score) {
  if (score == null) return "neutral";
  if (score >= 75) return "positive";
  if (score >= 55) return "warning";
  return "danger";
}
