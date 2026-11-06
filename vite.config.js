import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Every top-level *.html file is a page and its own build entry, so adding a
// topic only takes a new HTML file (plus a card in index.html).
const root = fileURLToPath(new URL('.', import.meta.url));
const pages = Object.fromEntries(
  readdirSync(root)
    .filter((file) => file.endsWith('.html'))
    .map((file) => [file.slice(0, -'.html'.length), file]),
);

// Relative asset URLs, so the build works from any path, e.g. GitHub Pages'
// https://<user>.github.io/functionplotter/.
export default defineConfig({
  base: './',
  build: {
    rolldownOptions: { input: pages },
  },
});
