import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // MapLibre starts its own web worker, which Vite's dev pre-bundler breaks
  // (see scripts/copy-maplibre.mjs for how production serves the worker).
  optimizeDeps: { exclude: ['maplibre-gl', '@maplibre/maplibre-gl-leaflet'] },
  // Code is split along the lazy imports: the planner (with Leaflet), the
  // 3D hero (three.js) and the vector map engine (MapLibre) are each
  // downloaded only when needed.
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
    css: false,
    include: ['src/**/*.test.{js,jsx}'],
  },
})
