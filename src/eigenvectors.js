import { renderStatic, setTex, texNum as T, texText } from './tex.js';
import { svgEl, svgTex, num, frame, axes, arrow, equalScale, setFacts, serializeHash, stateFromHash, writeHash } from './pageUtils.js';
import { apply, det, trace, eigen, angleBetween } from './linearMath.js';

// Page for eigenvectors: a unit vector v turns around the circle, and Av is
// drawn with it; where Av lands on v's own line, v is an eigenvector. Below,
// the angle from v to Av against v's direction: its zeros (and ±180°) are
// the eigen-directions.

// The matrix is ( a b ; c d ) under the hash keys a, b, c, d (see AGENTS.md); theta in degrees.
const DEFAULTS = { a: 1.5, b: 1, c: 0.5, d: 1, theta: 60 };
const PRESETS = [
  { label: 'Two directions, λ = 2 and 0.5', a: 1.5, b: 1, c: 0.5, d: 1 },
  { label: 'Symmetric: perpendicular directions', a: 2, b: 1, c: 1, d: 2 },
  { label: 'A negative eigenvalue: λ = 2 and −1', a: -1, b: 1, c: 0, d: 2 },
  { label: 'Reflection: λ = 1 and −1', a: 0, b: 1, c: 1, d: 0 },
  { label: 'Shear: only one direction', a: 1, b: 1, c: 0, d: 1 },
  { label: 'Rotation by 30°: no real direction', a: 0.866, b: -0.5, c: 0.5, d: 0.866 },
  { label: '1.5·I: every direction', a: 1.5, b: 0, c: 0, d: 1.5 },
  { label: 'Projection: λ = 1 and 0', a: 1, b: 1, c: 0, d: 0 },
];
const ON_LINE = 0.5; // degrees: Av counts as on v's line within this angle
const SNAP = 2; // degrees: dragging v snaps to an eigen-direction this close
const SPOKES = 24; // faint lines from v to Av around the circle
const ANGLE_SAMPLES = 720;
const TURN_DEG_PER_S = 40;
const MARGIN = { top: 12, right: 12, bottom: 26, left: 40 };

const $ = (id) => document.getElementById(id);
const fields = { a: $('a'), b: $('b'), c: $('c'), d: $('d'), theta: $('theta') };
const thetaSlider = $('thetaSlider');
const mainSvg = document.querySelector('#chart > svg');
const angleSvg = document.querySelector('#angleChart > svg');

for (const [i, preset] of PRESETS.entries()) $('preset').add(new Option(preset.label, i));

function readForm() {
  const state = {};
  for (const key of Object.keys(fields)) state[key] = parseFloat(fields[key].value);
  return state;
}

function writeForm(state) {
  for (const key of Object.keys(fields)) if (key in state) fields[key].value = state[key];
}

/** θ wrapped into [0, 360), and defaults for fields that aren't numbers. */
function clampState(raw) {
  const state = {};
  for (const key of ['a', 'b', 'c', 'd']) state[key] = Number.isFinite(raw[key]) ? raw[key] : DEFAULTS[key];
  const theta = Number.isFinite(raw.theta) ? raw.theta : DEFAULTS.theta;
  state.theta = +((((theta % 360) + 360) % 360).toFixed(4));
  return state;
}

const matrixOf = ({ a, b, c, d }) => [a, b, c, d];
const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const dir = (theta) => [Math.cos(rad(theta)), Math.sin(rad(theta))];

/** The eigen-directions as angles in [0, 180), with their eigenvalues. */
function eigenDirections(e) {
  if (!e.vectors) return [];
  return e.vectors.map((v, i) => ({ theta: (deg(Math.atan2(v[1], v[0])) + 360) % 180, lambda: e.values[i] }));
}

/** Where v's direction makes Av lie on v's line: { lambda } or null. */
function onLine(A, theta) {
  const v = dir(theta);
  const Av = apply(A, v);
  const len = Math.hypot(...Av);
  if (len < 1e-9) return { lambda: 0 };
  const angle = angleBetween(v, Av);
  if (Math.abs(angle) <= ON_LINE) return { lambda: len };
  if (180 - Math.abs(angle) <= ON_LINE) return { lambda: -len };
  return null;
}

// --- Main chart: circle, ellipse, v and Av ----------------------------------------------------

let view = null;

function drawMain(state, e) {
  const box = frame(mainSvg, MARGIN);
  view = null;
  if (!box) return;
  const A = matrixOf(state);
  // Big enough for the image of the circle: its half-axes are at most the Frobenius norm.
  const R = Math.max(1.6, 1.15 * Math.hypot(...A));
  const v = equalScale(box, -R, R, -R, R);
  const { sx, sy } = v;
  const P = ([x, y]) => [sx(x), sy(y)];
  const step = R > 5 ? 2 : R > 2.5 ? 1 : 0.5;
  const ticks = [];
  for (let k = Math.ceil(v.xMin / step) * step; k <= v.xMax; k += step) ticks.push([+k.toFixed(6), sx(k)]);
  axes(mainSvg, box, ticks, v.yMin, v.yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, mainSvg);
  const far = 3 * R;

  // Eigen-directions as full lines through 0.
  if (e.kind === 'scalar') {
    svgTex(plot, MARGIN.left + 6, MARGIN.top + 4, `\\text{every direction: } \\lambda = ${T(e.values[0], 3)}`, { baseline: 'top', cls: 'eigen-label' });
  }
  for (const { theta, lambda } of eigenDirections(e)) {
    const [ux, uy] = dir(theta);
    svgEl('line', { x1: sx(-far * ux), y1: sy(-far * uy), x2: sx(far * ux), y2: sy(far * uy), class: 'eigen-line' }, plot);
    // Label the line inside the view, on its upper (or right) half.
    const s = uy < 0 || (uy === 0 && ux < 0) ? -1 : 1;
    const t = 0.8 * Math.min(Math.abs(ux) > 1e-9 ? v.xMax / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? v.yMax / Math.abs(uy) : Infinity);
    const px = s * t * ux;
    svgTex(plot, sx(px) + (px > 0 ? -6 : 6), sy(s * t * uy) + 6, `\\lambda = ${T(lambda, 3)}`, { anchor: px > 0 ? 'end' : 'start', baseline: 'top', cls: 'eigen-label' });
  }

  // Unit circle, its image (an ellipse, or a segment when det = 0), and spokes v → Av.
  const circle = Array.from({ length: 181 }, (_, i) => dir(2 * i));
  const pts = (list) => list.map((p) => P(p).map((c) => c.toFixed(1)).join(',')).join(' ');
  svgEl('polygon', { points: pts(circle), class: 'circle' }, plot);
  svgEl('polygon', { points: pts(circle.map((p) => apply(A, p))), class: 'ellipse' }, plot);
  for (let i = 0; i < SPOKES; i++) {
    const p = dir((360 * i) / SPOKES);
    const q = apply(A, p);
    svgEl('line', { x1: sx(p[0]), y1: sy(p[1]), x2: sx(q[0]), y2: sy(q[1]), class: 'spoke' }, plot);
  }

  // The test vector v, its line, and Av.
  const u = dir(state.theta);
  const Au = apply(A, u);
  svgEl('line', { x1: sx(-far * u[0]), y1: sy(-far * u[1]), x2: sx(far * u[0]), y2: sy(far * u[1]), class: 'v-line' }, plot);
  const o = P([0, 0]);
  const hit = onLine(A, state.theta);
  arrow(plot, ...o, ...P(Au), { cls: hit ? 'e1 on-line' : 'e1', head: 11 });
  arrow(plot, ...o, ...P(u), { cls: 'v', head: 10 });
  svgTex(plot, sx(u[0] * 1.08), sy(u[1] * 1.08), 'v', { anchor: u[0] >= 0 ? 'start' : 'end', baseline: 'middle' });
  const r = Math.hypot(...Au) || 1;
  svgTex(plot, sx(Au[0] + (0.15 * Au[0]) / r), sy(Au[1] + (0.15 * Au[1]) / r), hit ? `Av = ${T(hit.lambda, 3)}\\,v` : 'Av', {
    anchor: Au[0] >= 0 ? 'start' : 'end',
    baseline: 'middle',
    cls: hit ? 'eigen-label' : 'e1-label',
  });
  svgEl('circle', { cx: sx(u[0]), cy: sy(u[1]), r: 14, class: 'handle' }, plot);

  view = { box, v };
  mainSvg.setAttribute('aria-label', `The unit vector v at ${num(state.theta)} degrees and its image Av` + (hit ? ', on the same line: an eigenvector' : ''));
}

// --- Angle chart ---------------------------------------------------------------------

let angleMap = null;

function drawAngle(state, e) {
  const box = frame(angleSvg, MARGIN);
  angleMap = null;
  if (!box) return;
  const A = matrixOf(state);
  const sx = (t) => MARGIN.left + (t / 360) * box.plotW;
  const sy = (a) => MARGIN.top + (1 - (a + 200) / 400) * box.plotH;
  const ticks = [0, 45, 90, 135, 180, 225, 270, 315, 360].map((t) => [t, sx(t)]);
  axes(angleSvg, box, ticks, -200, 200, sy, [-180, -90, 0, 90, 180]);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, angleSvg);
  for (const ref of [-180, 180]) svgEl('line', { x1: MARGIN.left, x2: MARGIN.left + box.plotW, y1: sy(ref), y2: sy(ref), class: 'reference' }, plot);

  // The angle wraps from 180° to −180°: break the curve there instead of drawing a vertical jump.
  let d = '';
  let prev = null;
  for (let i = 0; i <= ANGLE_SAMPLES; i++) {
    const t = (360 * i) / ANGLE_SAMPLES;
    const Av = apply(A, dir(t));
    const a = Math.hypot(...Av) < 1e-12 ? NaN : angleBetween(dir(t), Av);
    if (!Number.isFinite(a)) {
      prev = null;
      continue;
    }
    const jump = prev !== null && Math.abs(a - prev) > 180;
    d += `${prev === null || jump ? 'M' : 'L'}${sx(t).toFixed(1)},${sy(a).toFixed(1)}`;
    prev = a;
  }
  svgEl('path', { d, class: 'angle-curve' }, plot);
  for (const { theta } of eigenDirections(e)) {
    for (const t of [theta, theta + 180]) svgEl('line', { x1: sx(t), x2: sx(t), y1: MARGIN.top, y2: MARGIN.top + box.plotH, class: 'eigen-mark' }, plot);
  }
  const Au = apply(A, dir(state.theta));
  const a = Math.hypot(...Au) < 1e-12 ? 0 : angleBetween(dir(state.theta), Au);
  svgEl('circle', { cx: sx(state.theta), cy: sy(a), r: 5, class: 'marker' }, plot);

  angleMap = { box };
  angleSvg.setAttribute('aria-label', 'Angle from v to Av against the direction of v, from 0 to 360 degrees');
}

// --- Pointer and keyboard -------------------------------------------------------------

function thetaAtPointer(e) {
  const rect = mainSvg.getBoundingClientRect();
  const [x, y] = view.v.toMath(e.clientX - rect.left, e.clientY - rect.top);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Snaps θ to an eigen-direction (or its opposite) within SNAP degrees. */
function snapTheta(theta, e) {
  for (const { theta: t } of eigenDirections(e)) {
    for (const target of [t, t + 180]) {
      const diff = ((theta - target + 540) % 360) - 180;
      if (Math.abs(diff) <= SNAP) return +target.toFixed(4);
    }
  }
  return theta;
}

let dragging = false;
mainSvg.addEventListener('pointerdown', (e) => {
  if (!view) return;
  stopPlay();
  dragging = true;
  mainSvg.setPointerCapture(e.pointerId);
  setTheta(snapTheta(thetaAtPointer(e), eigen(matrixOf(clampState(readForm())))));
});
mainSvg.addEventListener('pointermove', (e) => {
  if (!view) return;
  if (dragging) setTheta(snapTheta(thetaAtPointer(e), eigen(matrixOf(clampState(readForm())))));
  showReadout();
});
mainSvg.addEventListener('pointerup', () => (dragging = false));
mainSvg.addEventListener('pointercancel', () => (dragging = false));
mainSvg.addEventListener('pointerleave', () => ($('hover').innerHTML = ''));
mainSvg.addEventListener('keydown', (e) => {
  if (!view || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  stopPlay();
  setTheta(clampState(readForm()).theta + (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1));
  showReadout();
});

function showReadout() {
  const state = clampState(readForm());
  const A = matrixOf(state);
  const u = dir(state.theta);
  const Au = apply(A, u);
  const vec = ([x, y]) => `(${T(x, 3)}, ${T(y, 3)})`;
  setTex($('hover'), `v = ${vec(u)} \\quad Av = ${vec(Au)} \\quad \\angle = ${T(angleBetween(u, Au), 3)}^\\circ`);
}

let angleDragging = false;
function thetaAtAngleChart(e) {
  const px = e.clientX - angleSvg.getBoundingClientRect().left;
  return Math.min(360, Math.max(0, ((px - MARGIN.left) / angleMap.box.plotW) * 360));
}
angleSvg.addEventListener('pointerdown', (e) => {
  if (!angleMap) return;
  stopPlay();
  angleDragging = true;
  angleSvg.setPointerCapture(e.pointerId);
  setTheta(thetaAtAngleChart(e));
});
angleSvg.addEventListener('pointermove', (e) => {
  if (!angleMap) return;
  const t = thetaAtAngleChart(e);
  if (angleDragging) setTheta(t);
  const Au = apply(matrixOf(clampState(readForm())), dir(t));
  setTex($('angleHover'), `\\theta = ${T(t, 4)}^\\circ \\quad \\angle(v, Av) = ${T(angleBetween(dir(t), Au), 3)}^\\circ`);
});
angleSvg.addEventListener('pointerup', () => (angleDragging = false));
angleSvg.addEventListener('pointercancel', () => (angleDragging = false));
angleSvg.addEventListener('pointerleave', () => ($('angleHover').innerHTML = ''));
angleSvg.addEventListener('keydown', (e) => {
  if (!angleMap || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  stopPlay();
  setTheta(clampState(readForm()).theta + (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1));
  const { theta } = clampState(readForm());
  const Au = apply(matrixOf(clampState(readForm())), dir(theta));
  setTex($('angleHover'), `\\theta = ${T(theta, 4)}^\\circ \\quad \\angle(v, Av) = ${T(angleBetween(dir(theta), Au), 3)}^\\circ`);
});

// --- Explanation ---------------------------------------------------------------------

const vecTex = ([x, y]) => `\\begin{pmatrix} ${T(x, 3)} \\\\ ${T(y, 3)} \\end{pmatrix}`;

/** The linear-maps page's hash for this matrix, escaped for an href. */
function mapsHash({ a, b, c, d }) {
  return serializeHash({ a, b, c, d, t: 1 }).replaceAll('&', '&amp;');
}

/** " − 2.5λ" for the λ term of the characteristic polynomial (−tr·λ), without a factor 1 and empty for 0. */
function linearTerm(tr) {
  if (tr === 0) return '';
  const mag = Math.abs(tr) === 1 ? '' : `${T(Math.abs(tr), 4)}\\,`;
  return ` ${tr < 0 ? '+' : '-'} ${mag}\\lambda`;
}

function facts(state, e) {
  const A = matrixOf(state);
  const tr = trace(A);
  const D = det(A);
  const items = [];
  items.push([
    'The equation',
    `\\(Av = \\lambda v\\) has a solution \\(v \\ne 0\\) exactly when \\(\\det(A - \\lambda I) = 0\\), that is ` +
      `\\(\\lambda^2 - (\\operatorname{tr} A)\\,\\lambda + \\det A = \\lambda^2${linearTerm(tr)}${D === 0 ? '' : ` ${D < 0 ? '-' : '+'} ${T(Math.abs(D), 4)}`} = 0\\).`,
  ]);
  if (e.kind === 'distinct') {
    const [l1, l2] = e.values;
    const [v1, v2] = e.vectors;
    const perpendicular = Math.abs(v1[0] * v2[0] + v1[1] * v2[1]) < 1e-9;
    items.push([
      'Two directions',
      `\\(\\lambda_1 = ${T(l1, 4)}\\) with \\(v_1 = ${vecTex(v1)}\\) and \\(\\lambda_2 = ${T(l2, 4)}\\) with \\(v_2 = ${vecTex(v2)}\\). ` +
        'Along these two dashed lines \\(A\\) only stretches: vectors stay on their line' +
        ([l1, l2].some((l) => l < 0) ? ', and a negative \\(\\lambda\\) turns them around on it' : '') +
        ([l1, l2].some((l) => Math.abs(l) < 1e-9) ? '; with \\(\\lambda = 0\\) that whole line is sent to 0' : '') +
        '. ' +
        (perpendicular
          ? 'They are perpendicular, as for every symmetric matrix.'
          : 'They are not perpendicular: that only happens for a symmetric matrix.') +
        ' The circle\'s image is an ellipse' + (Math.abs(D) < 1e-9 ? ' squashed flat' : '') + '; the eigen-directions are generally not its axes unless \\(A\\) is symmetric.',
    ]);
  } else if (e.kind === 'complex') {
    const r = Math.hypot(e.re, e.im);
    items.push([
      'No real direction',
      `\\(\\lambda = ${T(e.re, 4)} \\pm ${T(e.im, 4)}\\,i\\) is not real, so every vector is turned off its line: the angle in the lower chart never reaches \\(0^\\circ\\) or \\(180^\\circ\\). ` +
        `For a rotation times a scale, \\(|\\lambda| = ${T(r, 4)}\\) is the scale and \\(\\arg\\lambda = ${T(deg(Math.atan2(e.im, e.re)), 4)}^\\circ\\) the angle of the turn.`,
    ]);
  } else if (e.kind === 'scalar') {
    items.push(['Every direction', `\\(A = ${T(e.values[0], 4)}\\,I\\): every vector is an eigenvector with \\(\\lambda = ${T(e.values[0], 4)}\\), and the angle is \\(${e.values[0] < 0 ? '180' : '0'}^\\circ\\) everywhere.`]);
  } else {
    items.push([
      'Only one direction',
      `\\(\\lambda = ${T(e.values[0], 4)}\\) is a double root, but its eigenvectors form only one line, along \\(${vecTex(e.vectors[0])}\\). ` +
        'Every other vector is pushed off its line, as in a shear: the lower chart touches the reference line without crossing it.',
    ]);
  }
  const hit = onLine(A, state.theta);
  const u = dir(state.theta);
  items.push([
    `\\(v\\) at \\(${T(state.theta, 4)}^\\circ\\)`,
    hit
      ? `\\(Av = ${T(hit.lambda, 4)}\\,v\\): \\(v\\) is an eigenvector` + (Math.abs(hit.lambda) < 1e-9 ? ' for \\(\\lambda = 0\\).' : '.')
      : `\\(Av = ${vecTex(apply(A, u))}\\) points \\(${T(angleBetween(u, apply(A, u)), 3)}^\\circ\\) away from \\(v\\), so \\(v\\) is not an eigenvector. Turn \\(v\\) until \\(Av\\) lies on its dotted line.`,
  ]);
  items.push(['Related', `What \\(A\\) does to the whole plane: the <a href="./linear-maps.html#${mapsHash(state)}">linear maps</a> page with this matrix.`]);
  setFacts(items);
}

// --- Update and wiring -----------------------------------------------------------------

function update() {
  const raw = readForm();
  const state = clampState(raw);
  if (state.theta !== raw.theta) fields.theta.value = state.theta;
  thetaSlider.value = state.theta;
  $('status').textContent = Object.keys(fields).some((k) => !Number.isFinite(raw[k])) ? 'Enter a number in each field.' : '';
  const e = eigen(matrixOf(state));
  setTex($('formula'), `A = \\begin{pmatrix} ${T(state.a, 3)} & ${T(state.b, 3)} \\\\ ${T(state.c, 3)} & ${T(state.d, 3)} \\end{pmatrix}`);
  drawMain(state, e);
  drawAngle(state, e);
  facts(state, e);
  writeHash(state);
}

function setTheta(theta) {
  fields.theta.value = +theta.toFixed(2);
  update();
}

let frameId = null;
function stopPlay() {
  cancelAnimationFrame(frameId);
  frameId = null;
  $('play').innerHTML = texText('▶ Turn \\(v\\) around');
  $('play').setAttribute('aria-pressed', 'false');
}
$('play').addEventListener('click', () => {
  if (frameId) return stopPlay();
  $('play').textContent = '■ Stop';
  $('play').setAttribute('aria-pressed', 'true');
  let last = performance.now();
  const step = (now) => {
    const theta = clampState(readForm()).theta + ((now - last) / 1000) * TURN_DEG_PER_S;
    last = now;
    setTheta(theta);
    frameId = requestAnimationFrame(step);
  };
  frameId = requestAnimationFrame(step);
});

$('controls').addEventListener('input', (e) => {
  const t = e.target;
  if (t === thetaSlider) {
    stopPlay();
    setTheta(+thetaSlider.value);
  } else if (t.id === 'preset') {
    const preset = PRESETS[t.value];
    if (!preset) return;
    const { label, ...values } = preset;
    writeForm(values);
    update();
  } else {
    if (['a', 'b', 'c', 'd'].includes(t.id)) $('preset').value = '';
    update();
  }
});
$('controls').addEventListener('submit', (e) => e.preventDefault());

const resize = new ResizeObserver(() => update());
resize.observe(mainSvg);
resize.observe(angleSvg);

renderStatic();
writeForm(stateFromHash(DEFAULTS));
update();
