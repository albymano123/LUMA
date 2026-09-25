import { useEffect, useState } from "react";
import { CircleSlash } from "lucide-react";

import { useCountUp } from "../lib/hooks";
import { riskInfo, scoreTone } from "../lib/risk";
import "./ui.css";

/**
 * The safety score as a ring. The number and the ring both animate to the
 * value the backend supplied; nothing here computes or adjusts a score.
 * With no score it shows a dash, never a made-up number.
 */
export function ScoreRing({ score, level, size = 96, stroke, label = true, decorative = false }) {
  const info = riskInfo(level);
  const width = stroke ?? Math.max(5, Math.round(size / 11));
  const radius = 50 - width / 2;
  const circumference = 2 * Math.PI * radius;

  // Draw from empty on mount so the ring fills in.
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(score ?? 0));
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const counted = useCountUp(score);
  const accessible = score == null ? "No safety score" : `Safety score ${score} out of 100`;

  return (
    <div
      className="lp-ring"
      style={{ "--ring-size": `${size}px` }}
      data-tone={info.tone}
      {...(decorative ? { "aria-hidden": "true" } : { role: "img", "aria-label": accessible })}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="lp-ring__track" cx="50" cy="50" r={radius} strokeWidth={width} />
        <circle
          className="lp-ring__value"
          cx="50"
          cy="50"
          r={radius}
          strokeWidth={width}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
        />
      </svg>

      <div className="lp-ring__center" aria-hidden="true">
        <span className="lp-ring__number tabular">{score == null ? "–" : counted}</span>
        {label && <span className="lp-ring__unit">{score == null ? "no score" : "/ 100"}</span>}
      </div>
    </div>
  );
}

/**
 * One factor of the score: an animated bar, or an honest "data unavailable"
 * when the backend did not have the data (never a made-up value).
 */
export function FactorBar({ factor }) {
  const [filled, setFilled] = useState(0);
  const missing = factor.applicable && !factor.available;
  const notApplicable = !factor.applicable;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setFilled(factor.score ?? 0));
    return () => cancelAnimationFrame(frame);
  }, [factor.score]);

  let value = `${factor.score}/100`;

  if (notApplicable) value = "Not used for this mode";
  if (missing) value = "Data unavailable";

  const tone = scoreTone(factor.score);

  return (
    <div className={`lp-factor ${missing || notApplicable ? "lp-factor--missing" : ""}`} data-tone={tone}>
      <div className="lp-factor__head">
        <span className="lp-factor__label">{factor.label}</span>
        <span className="lp-factor__value tabular" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {(missing || notApplicable) && <CircleSlash size={13} aria-hidden="true" />}
          {value}
        </span>
      </div>

      <div
        className="lp-factor__track"
        role="progressbar"
        aria-label={`${factor.label}: ${value}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={missing || notApplicable ? undefined : factor.score}
        aria-valuetext={value}
      >
        <div className="lp-factor__fill" style={{ width: missing || notApplicable ? 0 : `${filled}%` }} />
      </div>
    </div>
  );
}
