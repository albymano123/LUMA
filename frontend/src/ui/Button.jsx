import { forwardRef } from "react";

import "./ui.css";

const cx = (...parts) => parts.filter(Boolean).join(" ");

/**
 * Primary interactive element.
 *   variant: primary | secondary | ghost | glass | danger
 *   size:    sm | md | lg
 * Renders any element/component via `as` (for links use as="a" or a router Link).
 * While `loading` it shows a spinner and ignores clicks, but keeps its label.
 */
export const Button = forwardRef(function Button(
  { as: Tag = "button", variant = "primary", size = "md", block = false, loading = false, disabled = false, icon, iconRight, className, children, onClick, ...props },
  ref
) {
  const inactive = disabled || loading;

  const handleClick = (event) => {
    if (inactive) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  };

  return (
    <Tag
      ref={ref}
      className={cx("lp-btn", `lp-btn--${variant}`, size !== "md" && `lp-btn--${size}`, block && "lp-btn--block", className)}
      aria-disabled={inactive || undefined}
      aria-busy={loading || undefined}
      {...(Tag === "button" ? { type: props.type ?? "button", disabled: inactive } : {})}
      onClick={handleClick}
      {...props}
    >
      {loading ? <span className="lp-btn__spinner" aria-hidden="true" /> : icon}
      {children}
      {!loading && iconRight}
    </Tag>
  );
});

export const IconButton = forwardRef(function IconButton(
  { as: Tag = "button", label, variant, size, className, children, ...props },
  ref
) {
  return (
    <Tag
      ref={ref}
      {...(Tag === "button" ? { type: "button" } : {})}
      aria-label={label}
      className={cx("lp-iconbtn", variant === "outline" && "lp-iconbtn--outline", size === "sm" && "lp-iconbtn--sm", className)}
      {...props}
    >
      {children}
    </Tag>
  );
});
