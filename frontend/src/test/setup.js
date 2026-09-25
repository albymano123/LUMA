import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom has no layout engine: minimal stand-ins for the browser APIs the
// interface uses.
class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= Observer;
globalThis.IntersectionObserver ??= Observer;

window.matchMedia ??= (query) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
