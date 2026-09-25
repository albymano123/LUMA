import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { LazyMotion, MotionConfig, domAnimation, m } from "motion/react";

import Home from "./pages/Home";
import About from "./pages/About";
import Emergency from "./pages/Emergency";
import { ToastProvider } from "./ui";

// The planner carries the map library, so it loads only when opened.
const MapPage = lazy(() => import("./pages/MapPage"));

function PageLoading() {
  return (
    <div className="lp-page-loading" role="status" aria-label="Loading">
      <span className="lp-btn__spinner" aria-hidden="true" />
    </div>
  );
}

function App() {
  const location = useLocation();

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <ToastProvider>
          <a href="#main" className="skip-link">Skip to content</a>

          <Suspense fallback={<PageLoading />}>
            {/* Keyed by path: each page fades in as the route changes. */}
            <m.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <Routes location={location}>
                <Route path="/" element={<Home />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/about" element={<About />} />
                <Route path="/emergency" element={<Emergency />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </m.div>
          </Suspense>
        </ToastProvider>
      </LazyMotion>
    </MotionConfig>
  );
}

export default App;
