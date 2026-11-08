import { niceTicks } from './format.js';
import { renderStatic, setTex, texNum as T, texText } from './tex.js';
import { svgEl, svgTex, frame, axes, polyline, setFacts, stateFromHash, writeHash } from './pageUtils.js';
import { seededRandom, DISTRIBUTIONS, sampleMeans, meanAndSd, binEdges, histogram, normalPdf, distanceToNormal } from './cltMath.js';

// Page for the central limit theorem: 5000 means of n random draws each, as
// a histogram with the normal curve the theorem predicts; below, the
// distribution of a single draw. The draws come from a seeded generator whose
// seed is in the hash, so a link shows the same samples.

const DEFAULTS = { dist: 'exponential', n: 5, seed: 1, zoom: false };
const COUNT = 5000;
const N_MAX = 400;
const STEP_MS = 180; // per step of "Increase n"
const MARGIN = { top: 12, right: 16, bottom: 26, left: 52 };

const $ = (id) => document.getElementById(id);
const nSlider = $('nSlider');
const mainSvg = document.querySelector('#chart > svg');
const popSvg = document.querySelector('#popChart > svg');

for (const [key, d] of Object.entries(DISTRIBUTIONS)) $('dist').add(new Option(d.label, key));

function readForm() {
  return { dist: $('dist').value, n: parseFloat($('n').value), seed: parseFloat($('seed').value), zoom: $('zoom').checked };
}

function writeForm({ dist, n, seed, zoom }) {
  $('dist').value = dist in DISTRIBUTIONS ? dist : DEFAULTS.dist;
  $('n').value = n;
  $('seed').value = seed;
  $('zoom').checked = zoom;
}

function clampState(raw) {
  return {
    dist: raw.dist in DISTRIBUTIONS ? raw.dist : DEFAULTS.dist,
    n: Number.isFinite(raw.n) ? Math.min(N_MAX, Math.max(1, Math.round(raw.n))) : DEFAULTS.n,
    seed: Number.isFinite(raw.seed) ? Math.max(0, Math.round(raw.seed)) >>> 0 : DEFAULTS.seed,
    zoom: raw.zoom,
  };
}

// --- Samples: recomputed when the distribution, n or the seed change ---------------------

let samples = null;

function getSamples({ dist, n, seed }) {
  const key = `${dist}|${n}|${seed}`;
  if (samples?.key === key) return samples;
  const d = DISTRIBUTIONS[dist];
  const means = sampleMeans(d, n, COUNT, seededRandom(seed));
  const sigma = Math.sqrt(d.variance / n);
  samples = { key, d, n, means, stats: meanAndSd(means), sigma, distance: distanceToNormal(means, d.mean, sigma) };
  return samples;
}

// --- Main chart: histogram and normal curve -----------------------------------------------

let main = null;
let pickedBar = null;

function drawMain(s, zoom) {
  const box = frame(mainSvg, MARGIN);
  main = null;
  if (!box || box.plotW <= 0 || box.plotH <= 0) return;
  const { d, n, sigma } = s;
  const [lo, hi] = zoom ? [d.mean - 4 * sigma, d.mean + 4 * sigma] : padRange(d.range);
  const { edges } = binEdges(d, n, lo, hi, zoom ? 40 : 50);
  const counts = histogram(s.means, edges);
  const w = edges[1] - edges[0];
  const dens = counts.map((c) => c / (COUNT * w));
  const peak = normalPdf(d.mean, d.mean, sigma);
  const yMax = 1.12 * Math.max(...dens, peak);
  const sx = (x) => MARGIN.left + ((x - lo) / (hi - lo)) * box.plotW;
  const sy = (y) => MARGIN.top + (1 - y / yMax) * box.plotH;
  const ticks = niceTicks(lo, hi, 8).ticks.filter((t) => t >= lo && t <= hi);
  axes(mainSvg, box, ticks.map((t) => [t, sx(t)]), 0, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, mainSvg);
  counts.forEach((c, i) => {
    if (!c) return;
    const x0 = sx(edges[i]);
    const x1 = sx(edges[i + 1]);
    svgEl('rect', { x: x0 + 0.5, width: Math.max(0.5, x1 - x0 - 1), y: sy(dens[i]), height: sy(0) - sy(dens[i]), class: i === pickedBar ? 'bar current' : 'bar' }, plot);
  });
  const pts = Array.from({ length: 401 }, (_, i) => {
    const x = lo + ((hi - lo) * i) / 400;
    return [sx(x), sy(normalPdf(x, d.mean, sigma))];
  });
  svgEl('path', { d: polyline(pts, (y) => y), class: 'normal' }, plot);
  svgEl('line', { x1: sx(d.mean), x2: sx(d.mean), y1: MARGIN.top, y2: MARGIN.top + box.plotH, class: 'mu' }, plot);
  svgTex(plot, sx(d.mean) + 4, MARGIN.top + 2, '\\mu', { baseline: 'top', cls: 'mu-label' });
  main = { box, edges, counts, lo, hi };
  mainSvg.setAttribute('aria-label', `Histogram of ${COUNT} means of ${n} draws, with the normal curve`);
}

/** The distribution's range with a little room on each side. */
function padRange([a, b]) {
  const pad = 0.06 * (b - a);
  return [a - pad, b + pad];
}

// --- Population chart -----------------------------------------------------------------------

let pop = null;

function drawPopulation(d) {
  const box = frame(popSvg, MARGIN);
  pop = null;
  if (!box || box.plotW <= 0 || box.plotH <= 0) return;
  const [lo, hi] = padRange(d.range);
  const sx = (x) => MARGIN.left + ((x - lo) / (hi - lo)) * box.plotW;
  let yMax;
  const plot = () => svgEl('g', { 'clip-path': box.clipUrl }, popSvg);
  const ticks = niceTicks(lo, hi, 8).ticks.filter((t) => t >= lo && t <= hi);
  let g;
  if (d.values) {
    yMax = 1.15 * Math.max(...d.values.map(([, p]) => p));
    const sy = (y) => MARGIN.top + (1 - y / yMax) * box.plotH;
    axes(popSvg, box, ticks.map((t) => [t, sx(t)]), 0, yMax, sy);
    g = plot();
    const bw = Math.min(24, (0.5 * box.plotW) / d.values.length);
    for (const [x, p] of d.values) svgEl('rect', { x: sx(x) - bw / 2, width: bw, y: sy(p), height: sy(0) - sy(p), class: 'population' }, g);
    pop = { box, lo, hi, sy };
  } else {
    const xs = Array.from({ length: 401 }, (_, i) => lo + ((hi - lo) * i) / 400);
    const ys = xs.map(d.density);
    // The arcsine density is infinite at its ends: cap the scale.
    yMax = 1.15 * Math.min(Math.max(...ys.filter(Number.isFinite)), 4);
    const sy = (y) => MARGIN.top + (1 - y / yMax) * box.plotH;
    axes(popSvg, box, ticks.map((t) => [t, sx(t)]), 0, yMax, sy);
    g = plot();
    const clampY = (y) => Math.max(MARGIN.top - 5, y);
    const line = polyline(xs.map((x, i) => [sx(x), sy(ys[i])]), clampY);
    svgEl('path', { d: `${line}L${sx(hi).toFixed(1)},${sy(0).toFixed(1)}L${sx(lo).toFixed(1)},${sy(0).toFixed(1)}Z`, class: 'population' }, g);
    pop = { box, lo, hi, sy };
  }
  // μ and a bracket of ±σ.
  const sigma = Math.sqrt(d.variance);
  svgEl('line', { x1: sx(d.mean), x2: sx(d.mean), y1: MARGIN.top, y2: MARGIN.top + box.plotH, class: 'mu' }, g);
  const yb = MARGIN.top + 10;
  svgEl('line', { x1: sx(d.mean - sigma), x2: sx(d.mean + sigma), y1: yb, y2: yb, class: 'sigma' }, g);
  svgTex(g, sx(d.mean) + 4, yb + 2, '\\mu \\pm \\sigma', { baseline: 'top', cls: 'mu-label' });
  pop.sx = sx;
  popSvg.setAttribute('aria-label', `The distribution of one draw: ${d.label}`);
}

// --- Pointer and keyboard -------------------------------------------------------------

function showBar(i) {
  pickedBar = i;
  const { edges, counts } = main;
  const s = samples;
  const share = counts[i] / COUNT;
  // What the normal curve predicts for this bin.
  const raw = normalPdf((edges[i] + edges[i + 1]) / 2, s.d.mean, s.sigma) * (edges[i + 1] - edges[i]);
  const predicted = raw < 5e-5 ? 0 : raw; // below 0.005 % shows as 0
  setTex($('hover'), `\\bar x \\in [${T(edges[i], 3)}, ${T(edges[i + 1], 3)}) \\quad ${counts[i]}\\text{ means} = ${T(100 * share, 3)}\\,\\% \\quad \\text{normal: } ${T(100 * predicted, 3)}\\,\\%`);
}

mainSvg.addEventListener('pointermove', (e) => {
  if (!main) return;
  const px = e.clientX - mainSvg.getBoundingClientRect().left;
  const x = main.lo + ((px - MARGIN.left) / main.box.plotW) * (main.hi - main.lo);
  const i = Math.floor((x - main.edges[0]) / (main.edges[1] - main.edges[0]));
  if (i < 0 || i >= main.counts.length) return;
  showBar(i);
  drawMain(samples, readForm().zoom);
});
mainSvg.addEventListener('pointerleave', () => {
  pickedBar = null;
  $('hover').innerHTML = '';
  if (samples) drawMain(samples, readForm().zoom);
});
mainSvg.addEventListener('keydown', (e) => {
  if (!main || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const mid = main.counts.indexOf(Math.max(...main.counts));
  const i = Math.min(main.counts.length - 1, Math.max(0, (pickedBar ?? mid) + (e.key === 'ArrowLeft' ? -1 : 1)));
  showBar(i);
  drawMain(samples, readForm().zoom);
});

let popCursor = null;
function showPop(x) {
  const d = samples.d;
  popCursor = x;
  if (d.values) {
    const [v, p] = d.values.reduce((best, cur) => (Math.abs(cur[0] - x) < Math.abs(best[0] - x) ? cur : best));
    setTex($('popHover'), `P(X = ${T(v)}) = ${T(p, 3)}`);
  } else {
    setTex($('popHover'), `x = ${T(x, 3)} \\quad \\text{density } ${T(d.density(x), 3)}`);
  }
}
popSvg.addEventListener('pointermove', (e) => {
  if (!pop) return;
  const px = e.clientX - popSvg.getBoundingClientRect().left;
  showPop(pop.lo + ((px - MARGIN.left) / pop.box.plotW) * (pop.hi - pop.lo));
});
popSvg.addEventListener('pointerleave', () => ($('popHover').innerHTML = ''));
popSvg.addEventListener('keydown', (e) => {
  if (!pop || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const step = samples.d.values ? samples.d.step : (pop.hi - pop.lo) / 50;
  const start = popCursor ?? samples.d.mean;
  showPop(Math.min(pop.hi, Math.max(pop.lo, start + (e.key === 'ArrowLeft' ? -step : step))));
});

// --- Explanation ---------------------------------------------------------------------

function facts(s) {
  const { d, n, sigma, stats, distance } = s;
  const items = [];
  const sd = Math.sqrt(d.variance);
  items.push([
    'The theorem',
    `Each mean \\(\\bar x_n\\) averages \\(n\\) independent draws from a distribution with mean \\(\\mu = ${T(d.mean, 4)}\\) and spread \\(\\sigma = ${T(sd, 4)}\\). ` +
      'For large \\(n\\) its distribution is close to the normal curve with mean \\(\\mu\\) and spread \\(\\sigma/\\sqrt{n}\\), whatever the shape of the distribution below, as long as \\(\\sigma\\) is finite.',
  ]);
  items.push([
    `For \\(n = ${n}\\)`,
    `The theory says the means center on \\(\\mu = ${T(d.mean, 4)}\\) with spread \\(\\sigma/\\sqrt{${n}} = ${T(sigma, 4)}\\). ` +
      `The ${COUNT} means drawn here average \\(${T(stats.mean, 4)}\\) with spread \\(${T(stats.sd, 4)}\\). ` +
      (n === 1 ? 'With \\(n = 1\\) a mean is a single draw, so the histogram has the shape of the distribution below.' : 'Quadrupling \\(n\\) halves the spread: the means close in on \\(\\mu\\) (the law of large numbers).'),
  ]);
  const skew = d.skewness / Math.sqrt(n);
  items.push([
    'How normal',
    `The largest gap between the share of means below a value and the share the normal curve predicts is \\(${T(100 * distance, 2)}\\,\\%\\)` +
      (d.step ? ` (for a discrete distribution it stays above 0 for every \\(n\\), though it shrinks: the means of \\(${n}\\) draws only take the values \\(${T(d.range[0], 2)} + k\\cdot${T(d.step, 2)}/${n}\\), so the curve fits the envelope of separate bars)` : '') +
      '. ' +
      (d.skewness
        ? `The distribution is skewed (skewness \\(${T(d.skewness, 3)}\\)); the skewness of \\(\\bar x_n\\) is \\(${T(d.skewness, 3)}/\\sqrt{${n}} = ${T(skew, 3)}\\), so the lopsidedness fades only slowly, like \\(1/\\sqrt{n}\\).`
        : 'The distribution is symmetric, so the means are symmetric for every \\(n\\) and the normal shape appears quickly.'),
  ]);
  items.push([
    'The samples',
    `The draws come from a generator started at seed ${s.key.split('|')[2]}; the link keeps the seed, so it shows these same means. "New samples" picks another seed.`,
  ]);
  items.push(['Related', '\\(\\bar x_n \\to \\mu\\) is a limit like those on the <a href="./sequences.html">sequences</a> page, but for random numbers: it holds with probability 1.']);
  setFacts(items);
}

// --- Update and wiring -----------------------------------------------------------------

function update() {
  const raw = readForm();
  const state = clampState(raw);
  if (state.n !== raw.n) $('n').value = state.n;
  if (state.seed !== raw.seed) $('seed').value = state.seed;
  nSlider.value = Math.min(100, state.n);
  const s = getSamples(state);
  if (pickedBar !== null && main && pickedBar >= main.counts.length) pickedBar = null;
  setTex($('formula'), `\\bar x_{${state.n}} = \\frac{X_1 + \\dots + X_{${state.n}}}{${state.n}}`);
  drawMain(s, state.zoom);
  drawPopulation(s.d);
  facts(s);
  writeHash(state);
}

let timer = null;
function stopPlay() {
  clearInterval(timer);
  timer = null;
  $('play').innerHTML = texText('▶ Increase \\(n\\)');
  $('play').setAttribute('aria-pressed', 'false');
}
$('play').addEventListener('click', () => {
  if (timer) return stopPlay();
  let n = 1;
  $('n').value = n;
  pickedBar = null;
  update();
  $('play').textContent = '■ Stop';
  $('play').setAttribute('aria-pressed', 'true');
  timer = setInterval(() => {
    n += n < 10 ? 1 : n < 30 ? 2 : 5;
    $('n').value = Math.min(100, n);
    update();
    if (n >= 100) stopPlay();
  }, STEP_MS);
});

$('reseed').addEventListener('click', () => {
  $('seed').value = Math.floor(Math.random() * 1e6);
  update();
});

$('controls').addEventListener('input', (e) => {
  const t = e.target;
  stopPlay();
  pickedBar = null;
  if (t === nSlider) $('n').value = nSlider.value;
  update();
});
$('controls').addEventListener('submit', (e) => e.preventDefault());

const resize = new ResizeObserver(() => update());
resize.observe(mainSvg);
resize.observe(popSvg);

renderStatic();
stopPlay();
writeForm(stateFromHash(DEFAULTS));
update();
