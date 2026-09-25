import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";

import Home from "./pages/Home";
import About from "./pages/About";
import Emergency from "./pages/Emergency";

// The map page carries the map library, so it loads only when opened.
const MapPage = lazy(() => import("./pages/MapPage"));

function PageLoading() {
  return (
    <Box sx={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <CircularProgress aria-label="Loading" />
    </Box>
  );
}

function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/about" element={<About />} />
        <Route path="/emergency" element={<Emergency />} />
      </Routes>
    </Suspense>
  );
}

export default App;
