// Decides whether the 3D hero is worth showing on this device. Anything
// doubtful gets the lightweight 2D version instead, so the page is never
// slowed down for the sake of decoration.

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

export function canRun3D() {
  if (typeof window === "undefined") return false;

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;

  const connection = navigator.connection;

  if (connection?.saveData) return false;
  if (connection?.effectiveType && /(^|-)2g$|3g/.test(connection.effectiveType)) return false;

  // Very low-end hardware (where reported).
  if (navigator.deviceMemory && navigator.deviceMemory <= 2) return false;
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return false;

  return hasWebGL();
}
