import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  base: '/heatmap/',
  server: {
    headers: {
      // Required for SharedArrayBuffer (The "High Performance" requirement)
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  worker: {
    format: 'es', // Ensures workers are bundled as ES Modules
  },
  build: {
    target: 'esnext', // Optimization for 2026 browsers
  }
});