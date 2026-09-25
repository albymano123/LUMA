import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import "./ui.css";

/**
 * An expandable section (smooth height animation, no JS measuring).
 * The header is a real button with aria-expanded / aria-controls.
 */
export function Disclosure({ title, icon, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className="lp-disclosure" data-open={open}>
      <button
        type="button"
        className="lp-disclosure__button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
        <span className="lp-disclosure__title">{title}</span>
        {badge}
        <ChevronDown size={18} className="lp-disclosure__chevron" aria-hidden="true" />
      </button>

      <div id={id} className="lp-disclosure__body" role="region" aria-label={title}>
        <div className="lp-disclosure__inner">
          <div className="lp-disclosure__content">{children}</div>
        </div>
      </div>
    </div>
  );
}
