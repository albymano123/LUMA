import { Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import MapPage from "./pages/MapPage";
import About from "./pages/About";
import Emergency from "./pages/Emergency";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/about" element={<About />} />
      <Route path="/emergency" element={<Emergency />} />
    </Routes>
  );
}

export default App;