import { useId } from "react";

/**
 * The LumaPath mark: a shield (safety) holding a route that curves from a
 * start point to a destination.
 */
export function LogoMark({ size = 32 }) {
  const id = useId();

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-bg`} x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b7bff" />
          <stop offset="1" stopColor="#0aa9d6" />
        </linearGradient>
        <linearGradient id={`${id}-path`} x1="10" y1="30" x2="30" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      <path
        d="M20 2.5 34.5 7.6v10.7c0 9.2-6 16.2-14.5 19.2C11.5 34.5 5.5 27.5 5.5 18.3V7.6L20 2.5Z"
        fill={`url(#${id}-bg)`}
      />
      <path
        d="M12.5 27.5c0-6 8.5-4.5 8.5-10 0-2.6 2.2-4 6-4"
        fill="none"
        stroke={`url(#${id}-path)`}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="12.5" cy="27.5" r="2.6" fill="#fff" />
      <circle cx="27" cy="13.5" r="3" fill="#fff" />
      <circle cx="27" cy="13.5" r="5.4" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" />
    </svg>
  );
}

export function Logo({ size = 32 }) {
  return (
    <span className="lp-logo">
      <LogoMark size={size} />
      <span className="lp-logo__word">LumaPath</span>
    </span>
  );
}
