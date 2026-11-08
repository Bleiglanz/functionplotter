import { compileFunction, constant, expressionToTex } from './expression.js';
import { niceTicks } from './format.js';
import { renderStatic, setTex, texNum as T } from './tex.js';
import { svgEl, svgTex, num, safe, frame, axes, extent, polyline, setFacts, stateFromHash, writeHash } from './pageUtils.js';
import { sampleMidpoints, coefficients, partialSum, amplitude, periodic, largestJump } from './fourierMath.js';

// Page for Fourier series: f on one period, repeated, and its partial sums
// Sₙ for a growing number n of harmonics, with the overshoot next to a jump
// (the Gibbs phenomenon); below, the size of each harmonic on a log scale.

const N_MAX = 100;
const M = 4096; // samples per period for the coefficients
const SAMPLES = 1200; // for drawing, across three periods
const LOG_FLOOR = -8; // harmonics below 10⁻⁸ of the largest are rounding noise
const STEP_MS = 250; // per harmonic in "Add harmonics"
const DEFAULTS = { expr: 'x < 0 ? -1 : 1', a: '-pi', b: 'pi', n: 5 };
const PRESETS = [
  { label: 'Square wave: a jump, Gibbs overshoot', expr: 'x < 0 ? -1 : 1', a: '-pi', b: 'pi', n: 5 },
  { label: 'Sawtooth x: jumps where the periods meet', expr: 'x', a: '-pi', b: 'pi', n: 5 },
  { label: 'Triangle |x|: a corner, no jump', expr: 'abs(x)', a: '-pi', b: 'pi', n: 3 },
  { label: 'Parabola x²', expr: 'x^2', a: '-pi', b: 'pi', n: 3 },
  { label: 'Rectified sine max(sin x, 0)', expr: 'max(sin(x), 0)', a: '-pi', b: 'pi', n: 4 },
  { label: 'e^(cos x): smooth, harmonics vanish fast', expr: 'exp(cos(x))', a: '-pi', b: 'pi', n: 2 },
  { label: 'A pulse of width 2', expr: 'abs(x) < 1 ? 1 : 0', a: '-pi', b: 'pi', n: 10 },
  { label: 'x on [0, 1]: period 1', expr: 'x', a: '0', b: '1', n: 8 },
];
const MARGIN = { top: 12, right: 16, bottom: 26, left: 52 };

const $ = (id) => document.getElementById(id);
const fields = { expr: $('expr'), a: $('a'), b: $('b'), n: $('n') };
const nSlider = $('nSlider');
const mainSvg = document.querySelector('#chart > svg');
const specSvg = document.querySelector('#spectrumChart > svg');

for (const [i, preset] of PRESETS.entries()) $('preset').add(new Option(preset.label, i));

function readForm() {
  return { expr: fields.expr.value, a: fields.a.value, b: fields.b.value, n: parseFloat(fields.n.value) };
}

function writeForm(state) {
  for (const key of Object.keys(fields)) fields[key].value = state[key];
}

// --- Model: f, the period and the coefficients --------------------------------------------

let model = null;

function getModel({ expr, a, b }) {
  const key = JSON.stringify([expr, a, b]);
  if (model?.key === key) return model;
  try {
    const compiled = compileFunction(expr, ['x']);
    const f = (x) => safe(compiled, x);
    const lo = constant(a, 'Period start');
    const hi = constant(b, 'Period end');
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('The period must be finite numbers.');
    if (!(lo < hi)) throw new Error('The period needs a start below its end.');
    const period = hi - lo;
    const samples = sampleMidpoints(f, lo, period, M);
    const bad = samples.fs.findIndex((v) => !Number.isFinite(v));
    if (bad >= 0) throw new Error(`f must be defined on the whole period; it isn't at x = ${num(samples.xs[bad], 4)}.`);
    const coeffs = coefficients(samples, period, N_MAX);
    const g = periodic(f, lo, period);
    // Draw three periods: one either side of [a, b].
    const vLo = lo - period;
    const vHi = hi + period;
    const xs = Array.from({ length: SAMPLES + 1 }, (_, i) => vLo + ((vHi - vLo) * i) / SAMPLES);
    const fs = xs.map(g);
    const amps = Array.from({ length: N_MAX + 1 }, (_, k) => amplitude(coeffs, k));
    const meanSquare = samples.fs.reduce((s, v) => s + v * v, 0) / M;
    model = {
      key,
      expr,
      f,
      g,
      lo,
      hi,
      period,
      omega: (2 * Math.PI) / period,
      coeffs,
      amps,
      maxAmp: Math.max(...amps),
      meanSquare,
      jump: largestJump(samples, period),
      vLo,
      vHi,
      xs,
      fs,
      yRange: extent(fs),
      fTex: expressionToTex(expr),
    };
  } catch (err) {
    model = { key, error: err.message };
  }
  return model;
}

function clampN(n) {
  return Number.isFinite(n) ? Math.min(N_MAX, Math.max(0, Math.round(n))) : DEFAULTS.n;
}

/**
 * The overshoot of Sₙ next to the jump: the largest excess beyond f's value on
 * the far side of the jump, as { x, y, excess } with excess as a fraction of
 * the jump; null without a jump or for n = 0.
 */
function overshoot(m, n) {
  if (!m.jump || n < 1) return null;
  const { at, size } = m.jump;
  const dir = Math.sign(size); // the sum overshoots upwards on the high side
  const reach = (2 * m.period) / n; // the overshoot sits about T/(2n) from the jump
  const sideOf = (s) => {
    const target = m.g(at + s * 1e-9 * m.period);
    let best = null;
    for (let i = 1; i <= 400; i++) {
      const x = at + (s * reach * i) / 400;
      const y = partialSum(m.coeffs, m.period, n, x);
      const excess = (dir * s * (y - target)) / Math.abs(size);
      if (!best || excess > best.excess) best = { x, y, excess };
    }
    return best;
  };
  const right = sideOf(1);
  const left = sideOf(-1);
  return right.excess >= left.excess ? right : left;
}

// --- Main chart: f and Sₙ ------------------------------------------------------------------

let main = null;

function drawMain(m, n, sums, over) {
  const box = frame(mainSvg, MARGIN);
  main = null;
  if (!box) return;
  const [y0, y1] = m.yRange;
  // Room above and below for the overshoot (≈ 9 % of a jump).
  const pad = 0.12 * (y1 - y0);
  const yMin = y0 - pad;
  const yMax = y1 + pad;
  const sx = (x) => MARGIN.left + ((x - m.vLo) / (m.vHi - m.vLo)) * box.plotW;
  const sy = (y) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * box.plotH;
  const clampY = (px) => Math.max(-10 * box.height, Math.min(11 * box.height, px));
  const ticks = niceTicks(m.vLo, m.vHi, 8).ticks.filter((t) => t >= m.vLo && t <= m.vHi);
  axes(mainSvg, box, ticks.map((t) => [t, sx(t)]), yMin, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, mainSvg);

  for (const x of [m.lo, m.hi]) svgEl('line', { x1: sx(x), x2: sx(x), y1: MARGIN.top, y2: MARGIN.top + box.plotH, class: 'period' }, plot);
  // f, broken at jumps of the periodic extension so they aren't drawn as steep lines.
  const jumpLimit = 0.25 * (y1 - y0 || 1);
  const pts = [];
  for (let i = 0; i < m.xs.length; i++) {
    if (i > 0 && Math.abs(m.fs[i] - m.fs[i - 1]) > jumpLimit) pts.push([sx(m.xs[i]), NaN]);
    pts.push([sx(m.xs[i]), sy(m.fs[i])]);
  }
  svgEl('path', { d: polyline(pts, clampY), class: 'curve' }, plot);
  svgEl('path', { d: polyline(m.xs.map((x, i) => [sx(x), sy(sums[i])]), clampY), class: 'sum' }, plot);

  if (over && over.excess > 0.005) {
    // Mark the overshoot in each of the three periods.
    for (const shift of [-m.period, 0, m.period]) {
      const x = over.x + shift;
      if (x < m.vLo || x > m.vHi) continue;
      svgEl('circle', { cx: sx(x), cy: sy(over.y), r: 4, class: 'overshoot-dot' }, plot);
    }
    svgEl('line', { x1: MARGIN.left, x2: MARGIN.left + box.plotW, y1: sy(over.y), y2: sy(over.y), class: 'overshoot' }, plot);
    svgTex(plot, MARGIN.left + box.plotW - 4, sy(over.y) - (over.y > (y0 + y1) / 2 ? 2 : -16), `+${T(100 * over.excess, 3)}\\,\\%\\text{ of the jump}`, {
      anchor: 'end',
      cls: 'overshoot-label',
    });
  }
  if (cursorX !== null) svgEl('line', { x1: sx(cursorX), x2: sx(cursorX), y1: MARGIN.top, y2: MARGIN.top + box.plotH, class: 'cursor' }, plot);

  main = { box };
  mainSvg.setAttribute('aria-label', `f repeated over three periods with its Fourier partial sum of ${n} harmonics`);
}

// --- Spectrum chart -------------------------------------------------------------------------

let spec = null;
let pickedK = null;

function drawSpectrum(m, n) {
  const box = frame(specSvg, MARGIN);
  spec = null;
  if (!box) return;
  const floor = Math.log10(m.maxAmp || 1) + LOG_FLOOR;
  const logs = m.amps.map((v) => (v > 0 ? Math.max(Math.log10(v), floor) : floor));
  const [yMin, yMax] = [floor, Math.max(...logs) + 0.3];
  const barW = box.plotW / (N_MAX + 1);
  const sx = (k) => MARGIN.left + (k + 0.5) * barW;
  const sy = (v) => MARGIN.top + (1 - (v - yMin) / (yMax - yMin)) * box.plotH;
  const ticks = niceTicks(0, N_MAX, 10).ticks.filter((t) => t >= 0 && t <= N_MAX);
  axes(specSvg, box, ticks.map((t) => [t, sx(t)]), yMin, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, specSvg);
  for (let k = 0; k <= N_MAX; k++) {
    if (logs[k] <= floor) continue;
    const top = sy(logs[k]);
    const cls = k === pickedK ? 'bar current' : k <= n ? 'bar used' : 'bar';
    svgEl('rect', { x: sx(k) - barW * 0.35, width: Math.max(1, barW * 0.7), y: top, height: MARGIN.top + box.plotH - top, class: cls }, plot);
  }
  spec = { box, barW };
  specSvg.setAttribute('aria-label', `Sizes of the harmonics k = 0 to ${N_MAX} on a log scale; the first ${n} are used`);
}

// --- Pointer and keyboard -------------------------------------------------------------

let cursorX = null;

function showX(x) {
  cursorX = x;
  const { n } = current;
  setTex($('hover'), `x = ${T(x)} \\quad f(x) = ${T(model.g(x))} \\quad S_{${n}}(x) = ${T(partialSum(model.coeffs, model.period, n, x))}`);
}

mainSvg.addEventListener('pointermove', (e) => {
  if (!main || model?.error) return;
  const px = e.clientX - mainSvg.getBoundingClientRect().left;
  showX(model.vLo + ((px - MARGIN.left) / main.box.plotW) * (model.vHi - model.vLo));
  update();
});
mainSvg.addEventListener('pointerleave', () => {
  cursorX = null;
  $('hover').innerHTML = '';
  update();
});
mainSvg.addEventListener('keydown', (e) => {
  if (!main || model?.error || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const step = ((model.vHi - model.vLo) / 200) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
  showX(Math.min(model.vHi, Math.max(model.vLo, (cursorX ?? model.lo + model.period / 2) + step)));
  update();
});

function showK(k) {
  pickedK = k;
  // Coefficients below 10⁻¹² of the largest are rounding noise: show them as 0.
  const tidy = (v) => (Math.abs(v) < 1e-12 * (model.maxAmp || 1) ? 0 : v);
  const a = model.coeffs.a.map(tidy);
  const b = model.coeffs.b.map(tidy);
  setTex($('spectrumHover'), k === 0 ? `a_0 = ${T(a[0], 4)}` : `k = ${k} \\quad a_{${k}} = ${T(a[k], 4)} \\quad b_{${k}} = ${T(b[k], 4)}`);
}

function kAt(e) {
  const px = e.clientX - specSvg.getBoundingClientRect().left;
  return Math.min(N_MAX, Math.max(0, Math.floor((px - MARGIN.left) / spec.barW)));
}

specSvg.addEventListener('pointermove', (e) => {
  if (!spec || model?.error) return;
  showK(kAt(e));
  update();
});
specSvg.addEventListener('pointerleave', () => {
  pickedK = null;
  $('spectrumHover').innerHTML = '';
  update();
});
specSvg.addEventListener('click', (e) => {
  if (!spec || model?.error) return;
  stopPlay();
  setN(kAt(e));
});
specSvg.addEventListener('keydown', (e) => {
  if (!spec || model?.error) return;
  if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    showK(Math.min(N_MAX, Math.max(0, (pickedK ?? current.n) + (e.key === 'ArrowLeft' ? -1 : 1))));
    update();
  } else if (e.key === 'Enter' && pickedK !== null) {
    stopPlay();
    setN(pickedK);
  }
});

// --- Explanation ---------------------------------------------------------------------

/** The argument kωx as TeX: "3x" when ω = 1, "6\pi x" when ω = 2π, else "3\omega x". */
function argTex(m, k) {
  const coef = (j) => (j === 1 ? '' : String(j));
  if (Math.abs(m.omega - 1) < 1e-12) return `${coef(k)}x`;
  if (Math.abs(m.omega - 2 * Math.PI) < 1e-12) return `${coef(2 * k)}\\pi x`;
  if (Math.abs(m.omega - Math.PI) < 1e-12) return `${coef(k)}\\pi x`;
  return `${coef(k)}\\omega x`;
}

/** Sₙ with its numbers, leaving out terms that are 0 and the middle of long sums. */
function sumTex(m, n) {
  const { a, b } = m.coeffs;
  const tiny = 1e-9 * (m.maxAmp || 1);
  const terms = [];
  if (Math.abs(a[0]) > tiny) terms.push({ v: a[0], body: '' });
  for (let k = 1; k <= n; k++) {
    if (Math.abs(a[k]) > tiny) terms.push({ v: a[k], body: `\\cos ${argTex(m, k)}` });
    if (Math.abs(b[k]) > tiny) terms.push({ v: b[k], body: `\\sin ${argTex(m, k)}` });
  }
  if (!terms.length) return '0';
  const shown = terms.length > 6 ? [...terms.slice(0, 4), null, ...terms.slice(-1)] : terms;
  return shown
    .map((t, i) => {
      if (t === null) return '+ \\dots';
      const mag = T(Math.abs(t.v), 3);
      const body = t.body ? `${mag}\\,${t.body}` : mag;
      return i === 0 ? (t.v < 0 ? '-' : '') + body : `${t.v < 0 ? '-' : '+'} ${body}`;
    })
    .join(' ');
}

/** The slope of log(amplitude) against log k over k = 10 … N_MAX, using the largest amplitude in each block. */
function decaySlope(m) {
  const pts = [];
  for (let k0 = 10; k0 + 5 <= N_MAX; k0 += 5) {
    let best = 0;
    let kb = k0;
    for (let k = k0; k < k0 + 5; k++) {
      if (m.amps[k] > best) {
        best = m.amps[k];
        kb = k;
      }
    }
    if (best > 1e-10 * (m.maxAmp || 1)) pts.push([Math.log(kb), Math.log(best)]);
  }
  if (pts.length < 4) return -Infinity; // the harmonics died out: smooth
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let num_ = 0;
  let den = 0;
  for (const [x, y] of pts) {
    num_ += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return num_ / den;
}

function facts(m, n, over) {
  const items = [];
  const omega = Math.abs(m.omega - 1) < 1e-12 ? '' : ` Here \\(\\omega = \\frac{2\\pi}{T} = ${T(m.omega, 4)}\\) for the period \\(T = ${T(m.period, 4)}\\).`;
  items.push([
    `\\(S_{${n}}\\)`,
    `\\(S_{${n}}(x) = ${sumTex(m, n)}\\). Each coefficient is an integral over one period: ` +
      '\\(a_k = \\frac{2}{T}\\int f(x)\\cos(k\\omega x)\\,dx\\), \\(b_k = \\frac{2}{T}\\int f(x)\\sin(k\\omega x)\\,dx\\), and \\(a_0\\) is the mean of \\(f\\).' +
      omega,
  ]);
  // Parseval: the mean square error is the mean of f² minus the energy in the harmonics used.
  const { a, b } = m.coeffs;
  let energy = a[0] * a[0];
  for (let k = 1; k <= n; k++) energy += (a[k] * a[k] + b[k] * b[k]) / 2;
  const rms = Math.sqrt(Math.max(0, m.meanSquare - energy));
  items.push([
    'Average error',
    `The root mean square of \\(f - S_{${n}}\\) over a period is \\(${T(rms, 3)}\\). ` +
      'It equals \\(\\sqrt{\\overline{f^2} - a_0^2 - \\frac{1}{2}\\sum_{k \\le n}(a_k^2 + b_k^2)}\\) (Parseval), so every harmonic added lowers it, towards 0.',
  ]);
  if (m.jump) {
    const { at, size } = m.jump;
    items.push([
      'At the jump',
      `\\(f\\) jumps by \\(${T(Math.abs(size), 3)}\\) at \\(x = ${T(Math.abs(at) < 1e-9 * m.period ? 0 : at, 4)}\\)` +
        (m.jump.at > m.hi - m.period / M - 1e-12 || m.jump.at < m.lo + m.period / M + 1e-12 ? ' (where one period meets the next)' : '') +
        '. ' +
        (over && over.excess > 0.005
          ? `Next to it \\(S_{${n}}\\) overshoots by \\(${T(100 * over.excess, 3)}\\,\\%\\) of the jump. Adding harmonics squeezes the overshoot closer to the jump but does not shrink it: it tends to about \\(9\\,\\%\\) (the Gibbs phenomenon). `
          : '') +
        'At the jump itself every \\(S_n\\) passes through the midpoint of the two sides. ' +
        'So \\(S_n\\) converges to \\(f\\) at each point away from the jump, but not uniformly: near the jump some error of half the jump remains for every \\(n\\).',
    ]);
  }
  const slope = decaySlope(m);
  items.push([
    'How fast the harmonics shrink',
    slope === -Infinity || slope < -4
      ? 'They shrink faster than any power of \\(1/k\\) in the lower chart: the repeated \\(f\\) is smooth, with no jump or corner, so a few harmonics already fit it closely.'
      : `For large \\(k\\) they shrink roughly like \\(k^{${T(slope, 2)}}\\). ` +
        (slope > -1.5
          ? 'About \\(1/k\\) is the mark of a jump: the series converges slowly, and \\(\\sum |a_k| + |b_k|\\) diverges.'
          : slope > -2.5
            ? 'About \\(1/k^2\\) is the mark of a corner (a jump in the slope): the sum converges uniformly.'
            : 'The faster they shrink, the smoother the repeated \\(f\\).'),
  ]);
  items.push([
    'Related',
    'The coefficients are integrals, approximated here by sums over 4096 points of the period, the way <a href="./riemann.html">Riemann sums</a> approximate an integral (the midpoint rule, which is very accurate for periodic functions).',
  ]);
  setFacts(items);
}

// --- Update and wiring -----------------------------------------------------------------

let current = null;

function update() {
  const raw = readForm();
  const m = getModel(raw);
  if (m.error) {
    $('status').textContent = m.error;
    for (const svg of [mainSvg, specSvg]) frame(svg, MARGIN);
    main = spec = current = null;
    $('formula').innerHTML = '';
    setFacts([]);
    writeHash(raw);
    return;
  }
  const n = clampN(raw.n);
  if (n !== raw.n) fields.n.value = n;
  nSlider.value = n;
  if (current?.key !== m.key || current.n !== n) {
    current = { key: m.key, n, sums: m.xs.map((x) => partialSum(m.coeffs, m.period, n, x)), over: overshoot(m, n) };
    facts(m, n, current.over);
  }
  $('status').textContent = '';
  setTex($('formula'), `f(x) = ${m.fTex}`);
  drawMain(m, n, current.sums, current.over);
  drawSpectrum(m, n);
  writeHash({ ...raw, n });
}

function setN(n) {
  fields.n.value = clampN(n);
  update();
}

let timer = null;
function stopPlay() {
  clearInterval(timer);
  timer = null;
  $('play').textContent = '▶ Add harmonics';
  $('play').setAttribute('aria-pressed', 'false');
}
$('play').addEventListener('click', () => {
  if (timer || !main) return stopPlay();
  let n = 0;
  setN(n);
  $('play').textContent = '■ Stop';
  $('play').setAttribute('aria-pressed', 'true');
  timer = setInterval(() => {
    n += n < 10 ? 1 : n < 30 ? 2 : 5;
    setN(n);
    if (n >= N_MAX) stopPlay();
  }, STEP_MS);
});

let debounce = null;
$('controls').addEventListener('input', (e) => {
  const t = e.target;
  if (t === nSlider) {
    stopPlay();
    setN(+nSlider.value);
  } else if (['expr', 'a', 'b'].includes(t.id)) {
    $('preset').value = '';
    stopPlay();
    clearTimeout(debounce);
    debounce = setTimeout(update, 150);
  } else if (t.id === 'preset') {
    const preset = PRESETS[t.value];
    if (!preset) return;
    stopPlay();
    const { label, ...values } = preset;
    writeForm(values);
    update();
  } else {
    stopPlay();
    update();
  }
});
$('controls').addEventListener('submit', (e) => e.preventDefault());

const resize = new ResizeObserver(() => update());
resize.observe(mainSvg);
resize.observe(specSvg);

renderStatic();
writeForm(stateFromHash(DEFAULTS));
update();
