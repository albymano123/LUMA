import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// ---------- media queries ----------

export function useMediaQuery(query) {
  const get = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;

  const [matches, setMatches] = useState(get);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;

    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);

    update();
    list.addEventListener("change", update);

    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");

// The planner switches to its phone layout below this width.
export const useIsPhone = () => useMediaQuery("(max-width: 899px)");


// ---------- count-up numbers ----------

/**
 * Animates a number from its previous value to `target`. Returns the
 * value to display. Skips the animation for reduced motion, and shows
 * `target` immediately when it is null.
 */
export function useCountUp(target, { duration = 700 } = {}) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const previous = useRef(target ?? 0);

  useEffect(() => {
    if (target == null || reduced) {
      previous.current = target ?? 0;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(target);
      return undefined;
    }

    const from = previous.current;
    const started = performance.now();
    let frame;

    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);

      setValue(Math.round(from + (target - from) * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        previous.current = target;
      }
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);

  return value;
}


// ---------- sliding indicator ----------

/**
 * Positions an indicator under the active item of a row of buttons.
 * Returns [containerRef, style]: spread `style` onto the container to
 * expose --ind-x / --ind-w CSS variables.
 */
export function useIndicator(activeKey) {
  const container = useRef(null);
  const [style, setStyle] = useState({ "--ind-x": "0px", "--ind-w": "0px", "--ind-o": 0 });

  const measure = useCallback(() => {
    const root = container.current;
    const active = root?.querySelector('[data-active="true"]');

    if (!root || !active) {
      setStyle((current) => ({ ...current, "--ind-o": 0 }));
      return;
    }

    setStyle({
      "--ind-x": `${active.offsetLeft}px`,
      "--ind-w": `${active.offsetWidth}px`,
      "--ind-o": 1,
    });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [activeKey, measure]);

  useEffect(() => {
    const root = container.current;

    if (!root || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(measure);
    observer.observe(root);

    return () => observer.disconnect();
  }, [measure]);

  return [container, style];
}


// ---------- misc ----------

export function useLocalFlag(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initial : stored === "true";
    } catch {
      return initial;
    }
  });

  const update = useCallback((next) => {
    setValue(next);

    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }, [key]);

  return [value, update];
}
