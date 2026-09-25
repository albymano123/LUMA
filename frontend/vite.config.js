import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Vendor code is split so the map page loads its heavy libraries
    // separately from the landing page.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'leaflet', test: (id) => /node_modules.*(leaflet)/.test(id) },
            { name: 'mui', test: (id) => /node_modules.*(@mui|@emotion)/.test(id) },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
    css: false,
    include: ['src/**/*.test.{js,jsx}'],
  },
})
