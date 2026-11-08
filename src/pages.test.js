import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Static check of the page contract in AGENTS.md ("Page contract"): reads the
// HTML, script and stylesheet files from disk. No browser; the manual
// checklist in specs/roadmap-and-page-contract.md covers what needs one.

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(root + path, 'utf8');
// '/src/x.js' in the HTML is 'src/x.js' on disk.
const local = (href) => href.replace(/^\//, '');

// The surface plotter follows the universal rules only (see "Named exceptions" in AGENTS.md).
const EXEMPT_FROM_2D_RULES = ['surface'];
// Pages that parse no user expression and so must not load math.js (U9).
const NO_EXPRESSION = ['clt', 'eigenvectors', 'exponential', 'linear-maps', 'zeta'];

const index = read('index.html');
const readme = read('README.md');
const pages = readdirSync(root)
  .filter((file) => file.endsWith('.html') && file !== 'index.html')
  .map((file) => file.slice(0, -'.html'.length));

const importsExpression = (source) => /from\s+['"]\.\/expression\.js['"]/.test(source);

it('finds the topic pages', () => {
  expect(pages).toEqual(expect.arrayContaining(['exponential', 'ftc', 'riemann', 'surface', 'zeta']));
});

it('keeps math.js out of pageUtils.js (U9)', () => {
  expect(importsExpression(read('src/pageUtils.js'))).toBe(false);
});

describe.each(pages)('%s.html', (page) => {
  const html = read(`${page}.html`);
  const scriptPath = html.match(/<script type="module" src="([^"]+)"/)?.[1];
  const script = scriptPath ? read(local(scriptPath)) : '';

  it('has a module script', () => {
    expect(scriptPath).toBeTruthy();
  });

  it('has a card on the index page (U2)', () => {
    expect(index).toContain(`href="./${page}.html"`);
  });

  it('is described in the README (U3)', () => {
    expect(readme).toContain(`${page}.html`);
  });

  it('links back to the index (U4)', () => {
    expect(html).toContain('href="./index.html"');
  });

  it('typesets its math with KaTeX (U5)', () => {
    expect(script).toContain('renderStatic(');
    expect(html).not.toMatch(/<su[bp][\s>]/);
  });

  if (NO_EXPRESSION.includes(page)) {
    it('does not load math.js (U9)', () => {
      expect(importsExpression(script)).toBe(false);
    });
  }

  if (!EXEMPT_FROM_2D_RULES.includes(page)) {
    const cssPath = html.match(/<link rel="stylesheet" href="([^"]+)"/)?.[1];

    it("builds on page.css (P1)", () => {
      expect(cssPath).toBeTruthy();
      expect(read(local(cssPath)).startsWith("@import './page.css';")).toBe(true);
    });

    it('has the shared layout (P2)', () => {
      for (const id of ['controls', 'chart', 'facts']) expect(html).toContain(`id="${id}"`);
    });

    it('uses the shared SVG and hash helpers instead of copies (P3)', () => {
      expect(script).not.toContain('createElementNS(');
      expect(script).not.toContain('URLSearchParams(location.hash');
    });

    it('has a home link in the header (P4)', () => {
      expect(html).toContain('class="home"');
    });
  }
});
