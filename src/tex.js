import katex from 'katex';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';
import './tex.css';
import { formatNumber } from './format.js';

// All mathematics on every page is typeset with KaTeX through this module:
// \( … \) in the HTML files (renderStatic), tex()/setTex() for strings built in
// JS, svgTex() (pageUtils.js) for labels inside SVG charts.

/** KaTeX HTML for a TeX string. Invalid TeX shows as a red error span instead of throwing. */
export function tex(src, { display = false } = {}) {
  return katex.renderToString(src, { throwOnError: false, displayMode: display });
}

/** Replaces the element's content with the typeset formula. */
export function setTex(el, src) {
  el.innerHTML = tex(src);
}

/** Typesets the \( … \) and \[ … \] in the static HTML below root. */
export function renderStatic(root = document.body) {
  renderMathInElement(root, {
    delimiters: [
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
    ],
    throwOnError: false,
  });
}

/** TeX for a number, as formatNumber shows it: 1.5e-12 becomes 1.5\cdot 10^{-12}. */
export function texNum(v, digits) {
  if (Number.isNaN(v)) return '\\text{undefined}';
  if (v === Infinity) return '\\infty';
  if (v === -Infinity) return '-\\infty';
  const s = formatNumber(v, digits);
  const [mantissa, exponent] = s.split('e');
  return exponent === undefined ? mantissa : `${mantissa}\\cdot 10^{${+exponent}}`;
}

/** "+ 2" / "- 2" for a term following another one. */
export function texSigned(v, digits) {
  return `${v < 0 ? '-' : '+'} ${texNum(Math.abs(v), digits)}`;
}

/**
 * HTML for prose with inline math: each \( … \) is typeset, the rest is kept as
 * HTML. Lets explanations be written the same way as the static pages.
 */
export function texText(text) {
  // Punctuation right after a formula stays on its line.
  return text.replace(/\\\((.+?)\\\)([.,;:)]*)/gs, (_, src, punct) =>
    punct ? `<span class="tex-nowrap">${tex(src)}${punct}</span>` : tex(src),
  );
}
