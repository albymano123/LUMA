import { useIndicator } from "../lib/hooks";
import "./ui.css";

/**
 * A row of mutually exclusive choices with a sliding highlight.
 *
 * Rendered as a labelled group of toggle buttons (aria-pressed), so it is
 * keyboard and screen-reader friendly and shows selection by more than
 * colour. Options: [{ value, label, icon, disabled, hint }].
 */
export function SegmentedControl({ label, options, value, onChange, inline = false, cards = false, className = "", hideLabels = false }) {
  const [ref, style] = useIndicator(value);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={`lp-seg ${inline ? "lp-seg--inline" : ""} ${cards ? "lp-seg--cards" : ""} ${className}`}
      style={style}
    >
      <span className="lp-seg__indicator" aria-hidden="true" />

      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="lp-seg__item"
          aria-pressed={option.value === value}
          data-active={option.value === value}
          disabled={option.disabled}
          title={option.hint}
          aria-label={hideLabels ? option.label : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span className={hideLabels ? "sr-only" : undefined}>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
