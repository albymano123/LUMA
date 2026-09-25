import { useRef } from "react";
import { useInView } from "motion/react";

import { useCountUp } from "../lib/hooks";

/** A number that counts up the first time it scrolls into view. */
export function Counter({ value, format = (n) => n.toLocaleString("en-IN") }) {
  const ref = useRef(null);
  const visible = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const shown = useCountUp(visible ? value : 0, { duration: 1100 });

  return (
    <span ref={ref} className="tabular">
      {format(shown ?? 0)}
    </span>
  );
}
