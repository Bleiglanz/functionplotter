import { formatNumber as fmt, niceTicks } from './format.js';
import { renderStatic, setTex, texNum as T, texText } from './tex.js';
import { svgTex } from './pageUtils.js';
import { partialSum, zeta, tailBounds } from './zetaMath.js';

// Page for the Riemann zeta function on the real axis x > 1, with the partial
// sums Sₙ(x) = Σ_{k=1}^{n} 1/kˣ approaching it from below as n grows.

const DEFAULTS = { n: 3, xMax: 6, yMax: 5 };
const N_MAX = 10000;
const SAMPLES = 500;
const MARGIN = { top: 12, right: 16, bottom: 26, left: 48 };
const NS = 'http://www.w3.org/2000/svg';

const $ = (id) => document.getElementById(id);
const fields = { n: $('n'), xMax: $('xMax'), yMax: $('yMax') };
const slider = $('nSlider');
const svg = document.querySelector('#chart svg');

const svgEl = (tag, attrs = {}, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.appendChild(el);
  return el;
};
const clampN = (n) => Math.min(N_MAX, Math.max(1, Math.round(n) || 1));

// --- State <-> form <-> URL hash -------------------------------------------

function readForm() {
  return { n: clampN(+fields.n.value), xMax: parseFloat(fields.xMax.value), yMax: parseFloat(fields.yMax.value) };
}

function writeForm(state) {
  for (const key of Object.keys(fields)) fields[key].value = state[key];
  slider.value = Math.log10(state.n);
}

function stateFromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const state = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    const v = +params.get(key);
    if (params.has(key) && Number.isFinite(v)) state[key] = v;
  }
  state.n = clampN(state.n);
  return state;
}

function writeHash(state) {
  history.replaceState(null, '', '#' + new URLSearchParams(Object.entries(state).map(([k, v]) => [k, String(v)])));
}

// --- Chart ------------------------------------------------------------------

let view = null;
let hoverX = null;

function draw(state) {
  const { n, xMax, yMax } = state;
  const width = svg.clientWidth;
  const height = svg.clientHeight;
  svg.replaceChildren();
  view = null;
  if (!width || !height || !(xMax > 1) || !(yMax > 0)) return;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const xMin = 1;
  const yMin = 0;
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const sx = (x) => MARGIN.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;
  // ζ blows up at x = 1; keep path coordinates finite and short.
  const clampY = (px) => Math.max(-2 * height, Math.min(2 * height, px));

  const clip = svgEl('clipPath', { id: 'plotArea' }, svgEl('defs', {}, svg));
  svgEl('rect', { x: MARGIN.left, y: MARGIN.top, width: plotW, height: plotH }, clip);

  const grid = svgEl('g', { class: 'grid' }, svg);
  const labels = svgEl('g', { class: 'tick-labels' }, svg);
  for (const t of niceTicks(yMin, yMax, 6).ticks.filter((t) => t >= yMin && t <= yMax)) {
    svgEl('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: sy(t), y2: sy(t), class: t === 0 ? 'zero' : '' }, grid);
    svgEl('text', { x: MARGIN.left - 6, y: sy(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, labels).textContent = fmt(t, 3);
  }
  for (const t of niceTicks(xMin, xMax, 8).ticks.filter((t) => t >= xMin && t <= xMax)) {
    svgEl('line', { x1: sx(t), x2: sx(t), y1: MARGIN.top, y2: MARGIN.top + plotH }, grid);
    svgEl('text', { x: sx(t), y: height - 8, 'text-anchor': 'middle' }, labels).textContent = fmt(t, 3);
  }

  // Samples are denser near x = 1, where ζ changes fastest.
  const xs = [];
  for (let i = 0; i <= SAMPLES; i++) xs.push(xMin + (xMax - xMin) * (i / SAMPLES) ** 2);
  const zetas = xs.map(zeta);
  const partials = xs.map((x) => partialSum(x, n));

  const plot = svgEl('g', { 'clip-path': 'url(#plotArea)' }, svg);
  const pt = (x, y) => `${sx(x).toFixed(1)},${clampY(sy(y)).toFixed(1)}`;
  // The tail ζ − Sₙ as a band between the curves (ζ is NaN at x = 1, so start after it).
  let band = '';
  for (let i = 1; i <= SAMPLES; i++) band += `${i > 1 ? 'L' : 'M'}${pt(xs[i], zetas[i])}`;
  for (let i = SAMPLES; i >= 1; i--) band += `L${pt(xs[i], partials[i])}`;
  svgEl('path', { d: band + 'Z', class: 'gap' }, plot);

  svgEl('line', { x1: sx(1), x2: sx(1), y1: MARGIN.top, y2: MARGIN.top + plotH, class: 'asymptote' }, plot);
  svgEl('line', { x1: MARGIN.left, x2: MARGIN.left + plotW, y1: sy(1), y2: sy(1), class: 'asymptote' }, plot);

  const path = (ys, from) => ys.slice(from).map((y, i) => `${i ? 'L' : 'M'}${pt(xs[i + from], y)}`).join('');
  svgEl('path', { d: path(zetas, 1), class: 'zeta' }, plot);
  svgEl('path', { d: path(partials, 0), class: 'partial' }, plot);

  // Known values ζ(2) = π²/6 and ζ(4) = π⁴/90.
  for (const [x, label] of [[2, '\\frac{\\pi^2}{6}'], [4, '\\frac{\\pi^4}{90}']]) {
    if (x > xMax) continue;
    const y = zeta(x);
    svgEl('circle', { cx: sx(x), cy: sy(y), r: 3.5, class: 'known' }, plot);
    svgTex(plot, sx(x) + 6, sy(y) - 6, `\\zeta(${x}) = ${label}`, { cls: 'point-label' });
  }

  view = { n, xMax, sx, sy, plotW, clampY };
  view.hover = svgEl('g', { class: 'hover', visibility: 'hidden' }, plot);
  view.rule = svgEl('line', { y1: MARGIN.top, y2: MARGIN.top + plotH, class: 'crosshair' }, view.hover);
  view.dotZeta = svgEl('circle', { r: 4, class: 'dot-zeta' }, view.hover);
  view.dotPartial = svgEl('circle', { r: 4.5, class: 'dot' }, view.hover);
  svg.setAttribute('aria-label', `Graph of zeta(x) and the partial sum with ${n} terms for x from 1 to ${fmt(xMax)}`);
  showHover(hoverX);
}

function showHover(x) {
  hoverX = x;
  const out = $('hover');
  if (!view || x == null || !(x > 1) || x > view.xMax) {
    view?.hover.setAttribute('visibility', 'hidden');
    out.innerHTML = '';
    return;
  }
  const { n, sx, sy, clampY, hover, rule, dotZeta, dotPartial } = view;
  const z = zeta(x);
  const s = partialSum(x, n);
  hover.setAttribute('visibility', 'visible');
  rule.setAttribute('x1', sx(x));
  rule.setAttribute('x2', sx(x));
  for (const [el, y] of [[dotZeta, z], [dotPartial, s]]) {
    el.setAttribute('cx', sx(x));
    el.setAttribute('cy', clampY(sy(y)));
  }
  setTex(out, `x = ${T(x)} \\quad \\zeta(x) = ${T(z, 6)} \\quad S_{${n}}(x) = ${T(s, 6)} \\quad \\zeta(x) - S_{${n}}(x) = ${T(z - s)}`);
}

svg.addEventListener('pointermove', (e) => {
  if (!view) return;
  const px = e.clientX - svg.getBoundingClientRect().left;
  showHover(1 + ((px - MARGIN.left) / view.plotW) * (view.xMax - 1));
});
svg.addEventListener('pointerleave', () => showHover(null));
svg.addEventListener('blur', () => showHover(null));
svg.addEventListener('keydown', (e) => {
  if (!view || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const step = ((view.xMax - 1) / 100) * (e.shiftKey ? 5 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
  const x = hoverX ?? 2;
  showHover(Math.min(view.xMax, Math.max(1 + 1e-6, x + step)));
});

// --- Properties -------------------------------------------------------------

function properties({ n }) {
  const at2 = partialSum(2, n);
  const tail2 = tailBounds(2, n);
  const harmonic = partialSum(1, n);
  return [
    [
      `\\(S_n(x) \\uparrow \\zeta(x)\\)`,
      `All terms are positive, so the partial sums increase with \\(n\\) and stay below \\(\\zeta(x)\\). ` +
        `At \\(x = 2\\): \\(S_{${n}}(2) = ${T(at2, 8)}\\), while \\(\\zeta(2) = \\frac{\\pi^2}{6} = ${T(Math.PI ** 2 / 6, 8)}\\) (Euler, 1734).`,
    ],
    [
      'Tail',
      `Comparing \\(\\sum_{k>n} \\frac{1}{k^x}\\) with \\(\\int t^{-x}\\,dt\\) gives ` +
        `\\(\\frac{(n+1)^{1-x}}{x-1} < \\zeta(x) - S_n(x) < \\frac{n^{1-x}}{x-1}\\). ` +
        `At \\(x = 2\\) with \\(n = ${n}\\) that is between \\(${T(tail2.lower)}\\) and \\(${T(tail2.upper)}\\): ` +
        `the error shrinks only like \\(1/n\\), and more slowly still as \\(x \\to 1\\).`,
    ],
    [
      'Pole at \\(x = 1\\)',
      `At \\(x = 1\\) the series is the harmonic series, \\(S_{${n}}(1) = ${T(harmonic, 6)} \\approx \\ln n + \\gamma = ${T(Math.log(n) + 0.5772156649, 6)}\\), which diverges. ` +
        `Correspondingly \\(\\zeta(x) \\approx \\frac{1}{x-1} + \\gamma\\) near \\(x = 1\\) (\\(\\gamma \\approx 0.5772\\), the Euler–Mascheroni constant).`,
    ],
    ['\\(\\zeta(x) \\to 1\\)', 'As \\(x \\to \\infty\\) every term but \\(\\frac{1}{1^x}\\) vanishes; \\(\\zeta(x) - 1 \\approx 2^{-x}\\).'],
    [
      'Euler product',
      '\\(\\zeta(x) = \\prod_{p \\text{ prime}} \\frac{1}{1 - p^{-x}}\\): expanding each factor as a geometric series and multiplying ' +
        'produces every \\(\\frac{1}{k^x}\\) exactly once, by unique prime factorization.',
    ],
    [
      'Beyond \\(x > 1\\)',
      'The series diverges for \\(x \\le 1\\), but \\(\\zeta\\) extends analytically to all complex numbers except the pole at \\(1\\). ' +
        'The Riemann hypothesis concerns its zeros there; this page stays on the real axis, \\(x > 1\\).',
    ],
  ];
}

function update() {
  const state = readForm();
  setTex($('formula'), `S_{${state.n}}(x) = \\sum_{k=1}^{${state.n}} \\frac{1}{k^x}`);
  const list = document.querySelector('#facts dl');
  list.replaceChildren();
  for (const [term, text] of properties(state)) {
    const dt = document.createElement('dt');
    dt.innerHTML = texText(term);
    const dd = document.createElement('dd');
    dd.innerHTML = texText(text);
    list.append(dt, dd);
  }
  draw(state);
  writeHash(state);
}

// --- Wiring -----------------------------------------------------------------

// The number field is the source of truth for n; the slider is logarithmic.
$('controls').addEventListener('input', (e) => {
  if (e.target === slider) fields.n.value = clampN(10 ** +slider.value);
  else if (e.target === fields.n) slider.value = Math.log10(clampN(+fields.n.value));
  update();
});
fields.n.addEventListener('change', () => (fields.n.value = readForm().n));
$('controls').addEventListener('submit', (e) => e.preventDefault());
$('reset').addEventListener('click', () => {
  writeForm(DEFAULTS);
  update();
});
new ResizeObserver(() => draw(readForm())).observe(svg);

renderStatic();
writeForm(stateFromHash());
update();
