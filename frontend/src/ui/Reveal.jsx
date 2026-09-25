import { m } from "motion/react";

/**
 * Fades and lifts its children into view the first time they scroll on
 * screen. Fast and small (translate 16 px, 500 ms); disabled entirely for
 * reduced motion by the app-wide MotionConfig.
 */
export function Reveal({ children, delay = 0, y = 16, as = "div", className, style, ...props }) {
  const Component = m[as] ?? m.div;

  return (
    <Component
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    >
      {children}
    </Component>
  );
}
