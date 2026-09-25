import "./ui.css";

const cx = (...parts) => parts.filter(Boolean).join(" ");

export function GlassCard({ as: Tag = "div", className, children, ...props }) {
  return (
    <Tag className={cx("lp-glass", className)} {...props}>
      {children}
    </Tag>
  );
}

export function Card({ as: Tag = "div", className, children, ...props }) {
  return (
    <Tag className={cx("lp-card", className)} {...props}>
      {children}
    </Tag>
  );
}

/** Small status pill. tone: positive | warning | danger | neutral | info | brand */
export function Badge({ tone = "neutral", icon, size, outline = false, className, children, ...props }) {
  return (
    <span
      className={cx("lp-badge", size === "lg" && "lp-badge--lg", outline && "lp-badge--outline", className)}
      data-tone={outline ? undefined : tone}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

/** Inline message. Use `role="alert"` only for failures the user must notice. */
export function Notice({ tone = "info", icon, title, action, className, children, role, ...props }) {
  return (
    <div className={cx("lp-notice", className)} data-tone={tone} role={role} {...props}>
      {icon}
      <div className="lp-notice__body">
        {title && <div className="lp-notice__title">{title}</div>}
        {children}
        {action && <div className="lp-notice__action">{action}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ width, height = 16, radius, className, style }) {
  return (
    <div
      aria-hidden="true"
      className={cx("lp-skeleton", className)}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/** Hover / focus tooltip. The trigger must carry its own accessible name. */
export function Tip({ text, below = false, children }) {
  return (
    <span className={cx("lp-tip", below && "lp-tip--below")} data-tip={text}>
      {children}
    </span>
  );
}

export function SectionHeader({ eyebrow, title, lead, center = false, as: Heading = "h2", id }) {
  return (
    <header className={cx("lp-section-header", center && "lp-section-header--center")}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <Heading id={id}>{title}</Heading>
      {lead && <p className="lead">{lead}</p>}
    </header>
  );
}

export function StatCard({ icon, label, value, hint }) {
  return (
    <div className="lp-stat">
      <div className="lp-stat__label">
        {icon}
        {label}
      </div>
      <div className="lp-stat__value tabular">{value}</div>
      {hint && <div className="lp-stat__hint">{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="lp-empty">
      {icon && <div className="lp-empty__icon">{icon}</div>}
      <h3 style={{ fontSize: "var(--fs-h4)" }}>{title}</h3>
      {children && <p style={{ maxWidth: 320 }}>{children}</p>}
      {action}
    </div>
  );
}
