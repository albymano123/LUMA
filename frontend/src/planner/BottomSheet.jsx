import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";

/*
  A draggable bottom sheet for the phone layout. Three snap points:
  "peek" (just the header), "half" and "full". Drag the handle or header,
  or use the button (keyboard and screen-reader friendly). Content scrolls
  inside the sheet once it is open.
*/

const PEEK_PX = 148;
const NAV_HEIGHT = 64;

export default function BottomSheet({ snap, onSnapChange, header, children, label = "Results" }) {
  const sheet = useRef(null);
  const moved = useRef(false);
  const [drag, setDrag] = useState(null); // {startY, startOffset, offset}
  const [viewport, setViewport] = useState(() => window.innerHeight);

  useEffect(() => {
    const update = () => setViewport(window.innerHeight);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Fully open, the sheet reaches the navigation bar.
  const sheetHeight = viewport - NAV_HEIGHT;
  const visible = {
    peek: PEEK_PX,
    half: Math.round(viewport * 0.5),
    full: sheetHeight,
  };
  const offsetFor = (name) => sheetHeight - visible[name];

  // The pointer is captured on press, so a fast flick that leaves the header
  // between two events still reaches the handlers. Because capture also
  // redirects the click away from the grip button, a tap on the grip is
  // recognised here (press and release without moving) instead of by onClick.
  const pending = useRef(null);
  const latest = useRef(0); // the offset of the last move (state may not have rendered yet)

  const onPointerDown = (event) => {
    // Other controls in the header keep working; the grip itself can drag.
    if (event.target.closest("button:not(.sheet__handle), a, input")) return;

    moved.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);

    pending.current = {
      startY: event.clientY,
      startOffset: offsetFor(snap),
      lastY: event.clientY,
      lastT: performance.now(),
      velocity: 0,
      onGrip: Boolean(event.target.closest(".sheet__handle")),
    };
  };

  const onPointerMove = (event) => {
    const start = pending.current;

    if (!start) return;

    if (!moved.current && Math.abs(event.clientY - start.startY) <= 6) return;

    moved.current = true;

    const now = performance.now();

    start.velocity = (event.clientY - start.lastY) / Math.max(1, now - start.lastT);
    start.lastY = event.clientY;
    start.lastT = now;

    latest.current = Math.min(offsetFor("peek"), Math.max(0, start.startOffset + event.clientY - start.startY));
    setDrag({ offset: latest.current });
  };

  const onPointerUp = () => {
    const start = pending.current;
    pending.current = null;

    if (!start) return;

    if (!moved.current) {
      if (start.onGrip) cycle();
      return;
    }

    // Throw the sheet in the direction of a quick flick, otherwise settle
    // on the nearest snap point.
    const projected = latest.current + start.velocity * 180;
    const nearest = ["peek", "half", "full"].reduce((best, name) =>
      Math.abs(offsetFor(name) - projected) < Math.abs(offsetFor(best) - projected) ? name : best
    );

    setDrag(null);
    onSnapChange(nearest);
  };

  const cycle = () => onSnapChange(snap === "peek" ? "half" : snap === "half" ? "full" : "peek");

  const offset = drag ? drag.offset : offsetFor(snap);

  return (
    <section
      ref={sheet}
      className="sheet"
      data-snap={snap}
      data-dragging={Boolean(drag)}
      aria-label={label}
      style={{ height: sheetHeight, transform: `translateY(${offset}px)` }}
    >
      <div
        className="sheet__top"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          className="sheet__handle"
          aria-label={snap === "full" ? "Collapse results" : "Expand results"}
          aria-expanded={snap !== "peek"}
          // Keyboard and assistive tech activate the button with a synthetic
          // click (detail 0); pointer taps are handled on release above.
          onClick={(event) => { if (event.detail === 0) cycle(); }}
        >
          <span className="sheet__grip" aria-hidden="true" />
          <ChevronUp className="sheet__chevron" size={16} aria-hidden="true" />
        </button>

        {header}
      </div>

      <div className="sheet__body" style={{ overflowY: snap === "peek" ? "hidden" : "auto" }}>
        {children}
      </div>
    </section>
  );
}
