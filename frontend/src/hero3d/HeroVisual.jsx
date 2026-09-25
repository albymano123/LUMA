import { lazy, Suspense, useEffect, useState } from "react";

import { canRun3D } from "../lib/capabilities";
import HeroFallback from "./HeroFallback";
import "./hero.css";

// three.js is large: it is only downloaded on capable devices, after the
// page has had a moment to paint.
const HeroScene = lazy(() => import("./HeroScene"));

/**
 * The hero background. Starts with the light 2D version (instant, part of
 * the first paint) and upgrades to the 3D scene when the device can afford
 * it, crossfading once the first 3D frame is drawn. If the scene turns out
 * to be slow it steps back down automatically.
 */
export default function HeroVisual() {
  const [mode, setMode] = useState("2d"); // 2d | loading | 3d
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (slow || !canRun3D()) return undefined;

    const start = () => setMode((current) => (current === "2d" ? "loading" : current));
    const idle = window.requestIdleCallback ?? ((callback) => setTimeout(callback, 400));
    const cancel = window.cancelIdleCallback ?? clearTimeout;
    const handle = idle(start, { timeout: 1500 });

    return () => cancel(handle);
  }, [slow]);

  return (
    <div className="hero-visual" data-mode={slow ? "2d" : mode}>
      <HeroFallback />

      {!slow && mode !== "2d" && (
        <Suspense fallback={null}>
          <HeroScene onReady={() => setMode("3d")} onSlow={() => setSlow(true)} />
        </Suspense>
      )}
    </div>
  );
}
