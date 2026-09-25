import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// Fonts are bundled with the app (no third-party font requests).
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";

import "./styles/tokens.css";
import "./styles/base.css";
import "./ui/ui.css";
import "./layout/layout.css";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
