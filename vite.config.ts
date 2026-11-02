import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works from any sub-path (e.g. GitHub Pages /<repo>/).
  base: './',
  plugins: [react()],
  build: {
    // axe-core (~550 KB) powers the in-app WCAG checker on the Accessibility page.
    chunkSizeWarningLimit: 1200,
  },
});
