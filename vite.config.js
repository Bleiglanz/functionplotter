import { defineConfig } from 'vite';

// Relative asset URLs, so the build works from any path, e.g. GitHub Pages'
// https://<user>.github.io/functionplotter/. Each HTML page is its own entry.
export default defineConfig({
  base: './',
  build: {
    rolldownOptions: {
      input: {
        main: 'index.html',
        exponential: 'exponential.html',
      },
    },
  },
});
