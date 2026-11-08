import { constant, expressionToTex, parseExpression } from './expression.js';
import { niceTicks } from './format.js';
import { renderStatic, setTex, texNum as T } from './tex.js';
import { svgEl, num, frame, axes, equalScale, setFacts, serializeHash, stateFromHash, writeHash } from './pageUtils.js';
import { compileComplex, domainColor, findZeros, findPoles } from './complexMath.js';

// Page for complex functions by domain coloring: each point z of the plane
// gets the color of f(z) (hue = argument, lightness = modulus). Zeros and
// poles are found and marked; the w-plane below is the color key, with the
// probe's value f(z) marked on it.

const DEFAULTS = { expr: '(z^2 - 1)/(z^2 + 1)', xMin: '-2', xMax: '2', yMin: '-1.5', yMax: '1.5' };
const PRESETS = [
  { label: '(z² − 1)/(z² + 1): two zeros, two poles', ...DEFAULTS },
  { label: 'z: the color wheel itself', expr: 'z', xMin: '-2', xMax: '2', yMin: '-1.5', yMax: '1.5' },
  { label: 'z²: a double zero', expr: 'z^2', xMin: '-2', xMax: '2', yMin: '-1.5', yMax: '1.5' },
  { label: 'z³ − 1: the cube roots of 1', expr: 'z^3 - 1', xMin: '-2', xMax: '2', yMin: '-1.5', yMax: '1.5' },
  { label: '1/z: a pole', expr: '1/z', xMin: '-2', xMax: '2', yMin: '-1.5', yMax: '1.5' },
  { label: 'z + 1/z', expr: 'z + 1/z', xMin: '-3', xMax: '3', yMin: '-2.2', yMax: '2.2' },
  { label: 'eᶻ: no zeros, period 2πi', expr: 'exp(z)', xMin: '-3', xMax: '3', yMin: '-7', yMax: '7' },
  { label: 'sin z: zeros on the real axis', expr: 'sin(z)', xMin: '-7', xMax: '7', yMin: '-3', yMax: '3' },
  { label: 'log z: a branch cut', expr: 'log(z)', xMin: '-2', xMax: '2', yMin: '-1.5', yMax: '1.5' },
  { label: '√z: half a turn of colors', expr: 'sqrt(z)', xMin: '-2', xMax: '2', yMin: '-1.5', yMax: '1.5' },
  { label: '(1 + i)·z: turn by 45°, stretch by √2', expr: '(1 + i) z', xMin: '-2', xMax: '2', yMin: '-1.5', yMax: '1.5' },
];
const DRAG_SCALE = 0.35; // canvas resolution while dragging, as a fraction of full
const W_RADIUS = 2.5; // half-width of the w-plane
const MARGIN = { top: 10, right: 10, bottom: 24, left: 40 };

const $ = (id) => document.getElementById(id);
const fields = { expr: $('expr'), xMin: $('xMin'), xMax: $('xMax'), yMin: $('yMin'), yMax: $('yMax') };
const zSvg = document.querySelector('#zPlane > svg');
const zCanvas = document.querySelector('#zPlane > canvas');
const wSvg = document.querySelector('#wPlane > svg');
const wCanvas = document.querySelector('#wPlane > canvas');

for (const [i, preset] of PRESETS.entries()) $('preset').add(new Option(preset.label, i));

function readForm() {
  const state = {};
  for (const key of Object.keys(fields)) state[key] = fields[key].value;
  return state;
}

function writeForm(state) {
  for (const key of Object.keys(fields)) if (key in state) fields[key].value = state[key];
}

// --- Model -----------------------------------------------------------------------------

let model = null;

function getModel({ expr, xMin, xMax, yMin, yMax }) {
  const key = JSON.stringify([expr, xMin, xMax, yMin, yMax]);
  if (model?.key === key) return model;
  try {
    if (!expr.trim()) throw new Error('Enter an expression in z.');
    let node;
    try {
      node = parseExpression(expr);
    } catch (err) {
      throw new Error(`Syntax error: ${err.message}`);
    }
    const f = compileComplex(node);
    const box = { xMin: constant(xMin, 'View'), xMax: constant(xMax, 'View'), yMin: constant(yMin, 'View'), yMax: constant(yMax, 'View') };
    if (!Object.values(box).every(Number.isFinite)) throw new Error('The view must be finite numbers.');
    if (!(box.xMin < box.xMax) || !(box.yMin < box.yMax)) throw new Error('The view needs each lower end below its upper end.');
    model = { key, expr, node, f, box, marks: null, fTex: expressionToTex(expr), branchCut: hasBranchCut(node) };
  } catch (err) {
    model = { key, error: err.message };
  }
  return model;
}

/** True when the formula uses a function with a branch cut (log, √, arg, non-integer powers). */
function hasBranchCut(node) {
  let cut = false;
  node.traverse((n) => {
    if (n.isFunctionNode && ['log', 'sqrt', 'arg'].includes(n.fn.name)) cut = true;
    if ((n.isOperatorNode && n.fn === 'pow') || (n.isFunctionNode && n.fn.name === 'pow')) {
      const e = n.args[1];
      if (!(e.isConstantNode && Number.isInteger(Number(e.value)))) cut = true;
    }
  });
  return cut;
}

/** Zeros and poles in the visible box, computed once per model and view. */
function marksFor(m, view) {
  const key = [view.xMin, view.xMax, view.yMin, view.yMax].map((v) => v.toPrecision(8)).join();
  if (m.marks?.key !== key) {
    const box = { xMin: view.xMin, xMax: view.xMax, yMin: view.yMin, yMax: view.yMax };
    m.marks = { key, zeros: findZeros(m.f, box), poles: findPoles(m.f, box) };
  }
  return m.marks;
}

// --- Drawing ----------------------------------------------------------------------------

let zView = null; // { box, v } of the z-plane
let wView = null;
let probe = null; // [x, y], the point whose value is shown

/** Paints the domain coloring of g over the plot area of `box` at resolution `scale`. */
function paint(canvas, box, v, g, scale) {
  const w = Math.max(1, Math.round(box.plotW * scale));
  const h = Math.max(1, Math.round(box.plotH * scale));
  Object.assign(canvas.style, { left: `${MARGIN.left}px`, top: `${MARGIN.top}px`, width: `${box.plotW}px`, height: `${box.plotH}px` });
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w, h);
  const data = image.data;
  const rgb = [0, 0, 0];
  const dx = (v.xMax - v.xMin) / w;
  const dy = (v.yMax - v.yMin) / h;
  let k = 0;
  for (let j = 0; j < h; j++) {
    const y = v.yMax - (j + 0.5) * dy;
    for (let i = 0; i < w; i++) {
      const [u, s] = g(v.xMin + (i + 0.5) * dx, y);
      domainColor(u, s, rgb);
      data[k] = rgb[0];
      data[k + 1] = rgb[1];
      data[k + 2] = rgb[2];
      data[k + 3] = 255;
      k += 4;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** Axes over a plane with equal units, ticks at nice numbers. */
function planeAxes(svg, box, v) {
  const xt = niceTicks(v.xMin, v.xMax, 8).ticks.filter((t) => t >= v.xMin && t <= v.xMax);
  const yt = niceTicks(v.yMin, v.yMax, 6).ticks.filter((t) => t >= v.yMin && t <= v.yMax);
  axes(svg, box, xt.map((t) => [t, v.sx(t)]), v.yMin, v.yMax, v.sy, yt);
}

function drawZ(m, scale = 1) {
  const box = frame(zSvg, MARGIN);
  zView = null;
  if (!box || box.plotW <= 0 || box.plotH <= 0) return;
  const v = equalScale(box, m.box.xMin, m.box.xMax, m.box.yMin, m.box.yMax);
  // Repaint the colors only when f, the view, the size or the resolution changed
  // (not for a moving probe).
  const paintKey = `${m.key}|${box.plotW}x${box.plotH}|${scale}`;
  if (zCanvas.dataset.key !== paintKey) {
    const start = performance.now();
    paint(zCanvas, box, v, m.f, scale);
    zSvg.dataset.renderMs = (performance.now() - start).toFixed(1);
    zCanvas.dataset.key = paintKey;
  }
  planeAxes(zSvg, box, v);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, zSvg);
  if (scale === 1) {
    const { zeros, poles } = marksFor(m, v);
    for (const { z, order } of zeros) {
      svgEl('circle', { cx: v.sx(z[0]), cy: v.sy(z[1]), r: 6, class: 'zero-mark' }, plot);
      if (order > 1) svgEl('text', { x: v.sx(z[0]) + 8, y: v.sy(z[1]) - 6, class: 'order' }, plot).textContent = order;
    }
    for (const { z, order } of poles) {
      const [cx, cy] = [v.sx(z[0]), v.sy(z[1])];
      svgEl('circle', { cx, cy, r: 6, class: 'pole-mark' }, plot);
      if (order > 1) svgEl('text', { x: cx + 8, y: cy - 6, class: 'order' }, plot).textContent = order;
    }
  }
  if (probe) {
    svgEl('circle', { cx: v.sx(probe[0]), cy: v.sy(probe[1]), r: 7, class: 'probe' }, plot);
    svgEl('circle', { cx: v.sx(probe[0]), cy: v.sy(probe[1]), r: 8.5, class: 'probe-inner' }, plot);
  }
  zView = { box, v };
  zSvg.setAttribute('aria-label', `Domain coloring of f(z) for real parts from ${num(v.xMin, 3)} to ${num(v.xMax, 3)}`);
}

function drawW(m) {
  const box = frame(wSvg, MARGIN);
  wView = null;
  if (!box || box.plotW <= 0 || box.plotH <= 0) return;
  const v = equalScale(box, -W_RADIUS, W_RADIUS, -W_RADIUS, W_RADIUS);
  // The w-plane only changes with its size: repaint it then.
  const sizeKey = `${box.plotW}x${box.plotH}`;
  if (wCanvas.dataset.size !== sizeKey) {
    paint(wCanvas, box, v, (x, y) => [x, y], 1);
    wCanvas.dataset.size = sizeKey;
  }
  planeAxes(wSvg, box, v);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, wSvg);
  if (probe && !m.error) {
    const [u, s] = m.f(...probe);
    if (Number.isFinite(u) && Number.isFinite(s)) {
      // A value outside the view is shown at its edge, in the right direction.
      const r = Math.hypot(u, s);
      const reach = 0.97 * Math.min(v.xMax, v.yMax);
      const k = r > reach ? reach / r : 1;
      svgEl('circle', { cx: v.sx(u * k), cy: v.sy(s * k), r: 7, class: 'probe' }, plot);
      svgEl('circle', { cx: v.sx(u * k), cy: v.sy(s * k), r: 8.5, class: 'probe-inner' }, plot);
    }
  }
  wView = { box, v };
  wSvg.setAttribute('aria-label', 'The w-plane colored by the same rule, with the value of f at the probe point');
}

// --- Pointer and keyboard -------------------------------------------------------------

function pointerZ(e) {
  const rect = zSvg.getBoundingClientRect();
  return zView.v.toMath(e.clientX - rect.left, e.clientY - rect.top);
}

const polar = ([u, s]) => {
  const r = Math.hypot(u, s);
  return `${T(r, 3)}\\,e^{${T(Math.atan2(s, u) / Math.PI, 3)}\\pi i}`;
};
const complexTex = ([a, b], digits = 3) => (Math.abs(b) < 1e-12 * Math.max(1, Math.abs(a)) ? T(a, digits) : `${T(a, digits)} ${b < 0 ? '-' : '+'} ${T(Math.abs(b), digits)}\\,i`);

function showProbe(p) {
  probe = p;
  const w = model.f(...p);
  const finite = w.every(Number.isFinite);
  setTex($('hover'), `z = ${complexTex(p)} \\quad f(z) = ${finite ? complexTex(w) : '\\text{undefined}'}`);
  setTex($('wheelHover'), finite ? `w = ${polar(w)}` : '');
}

let drag = null; // { x, y, box } at pointerdown, in math units, while panning

zSvg.addEventListener('pointerdown', (e) => {
  if (!zView || model?.error) return;
  zSvg.setPointerCapture(e.pointerId);
  zSvg.classList.add('dragging');
  // The mapping and typed ranges at the start; moves are measured in them.
  drag = { start: pointerZ(e), view: { ...zView.v }, typed: { ...model.box }, moved: false };
});
zSvg.addEventListener('pointermove', (e) => {
  if (!zView || model?.error) return;
  if (drag) {
    const rect = zSvg.getBoundingClientRect();
    const { scale, xMin, yMax } = drag.view;
    const px = e.clientX - rect.left - MARGIN.left;
    const py = e.clientY - rect.top - MARGIN.top;
    // The point under the pointer must stay the dragged point.
    const now = [xMin + px / scale, yMax - py / scale];
    const dx = drag.start[0] - now[0];
    const dy = drag.start[1] - now[1];
    if (Math.abs(dx) + Math.abs(dy) > 0) drag.moved = true;
    shiftView(dx, dy, drag.typed);
    return;
  }
  showProbe(pointerZ(e));
  drawZ(model);
  drawW(model);
});
function endDrag() {
  if (!drag) return;
  zSvg.classList.remove('dragging');
  const moved = drag.moved;
  drag = null;
  if (moved) update();
}
zSvg.addEventListener('pointerup', endDrag);
zSvg.addEventListener('pointercancel', endDrag);
zSvg.addEventListener('keydown', (e) => {
  if (!zView || model?.error) return;
  const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  if (!(e.key in steps)) return;
  e.preventDefault();
  const v = zView.v;
  const h = ((v.xMax - v.xMin) / 100) * (e.shiftKey ? 10 : 1);
  const [x, y] = probe ?? [(v.xMin + v.xMax) / 2, (v.yMin + v.yMax) / 2];
  showProbe([Math.min(v.xMax, Math.max(v.xMin, x + steps[e.key][0] * h)), Math.min(v.yMax, Math.max(v.yMin, y + steps[e.key][1] * h))]);
  drawZ(model);
  drawW(model);
});

/** Shifts the typed ranges `from` (at pan start) by (dx, dy) and draws at low resolution. */
function shiftView(dx, dy, from) {
  const round = (v) => +v.toPrecision(6);
  writeForm({ xMin: round(from.xMin + dx), xMax: round(from.xMax + dx), yMin: round(from.yMin + dy), yMax: round(from.yMax + dy) });
  $('preset').value = '';
  const m = getModel(readForm());
  if (m.error) return;
  drawZ(m, DRAG_SCALE);
  writeHash(readForm());
}

// --- Explanation ---------------------------------------------------------------------

function listTex(marks) {
  return marks.map(({ z, order }) => `\\(${complexTex(z, 4)}\\)` + (order > 1 ? ` (order ${order})` : '')).join(', ');
}

/** The linear-maps page's hash for multiplication by c = a + bi: the matrix ( a −b ; b a ). */
function mapsHash([a, b]) {
  return serializeHash({ a: +a.toPrecision(4), b: +(-b).toPrecision(4), c: +b.toPrecision(4), d: +a.toPrecision(4), t: 1 }).replaceAll('&', '&amp;');
}

function facts(m) {
  const items = [];
  items.push([
    'Reading the colors',
    'The hue is the argument of \\(f(z)\\): red where it is a positive real number, then yellow, green (near \\(i\\)), cyan (negative), blue, magenta. ' +
      'The lightness is the modulus: black near 0, white near \\(\\infty\\), with a small step at each doubling of \\(|f(z)|\\). The lower chart shows these colors on the \\(w\\)-plane.',
  ]);
  const { zeros, poles } = zView ? marksFor(m, zView.v) : { zeros: [], poles: [] };
  if (zeros.length || poles.length) {
    items.push([
      'Zeros and poles',
      (zeros.length ? `Zeros at ${listTex(zeros)}: the picture turns black there. ` : 'No zeros in view. ') +
        (poles.length ? `Poles at ${listTex(poles)}: the picture turns white. ` : '') +
        'Walking once counterclockwise around a zero of order \\(n\\), the colors run \\(n\\) times through red, yellow, green, cyan, blue, magenta; around a pole of order \\(n\\) they run \\(n\\) times backwards. ' +
        'This count, the winding number, is how the page finds each order.',
    ]);
  } else {
    items.push(['Zeros and poles', 'There are no zeros or poles in view: no black or white points, and the colors never wind all the way around.']);
  }
  if (m.branchCut) {
    items.push([
      'A branch cut',
      'The formula uses \\(\\log\\), \\(\\sqrt{\\ }\\) or a non-integer power, which are computed on their principal branch: the color jumps along a line (for \\(\\log z\\) and \\(\\sqrt z\\), the negative real axis). ' +
        'There \\(f\\) is not continuous, because no continuous choice of the logarithm exists all the way around 0.',
    ]);
  }
  if (probe) {
    const w = m.f(...probe);
    if (w.every(Number.isFinite)) {
      items.push([
        'At the probe',
        `\\(f(${complexTex(probe)}) = ${complexTex(w)} = ${polar(w)}\\): modulus \\(${T(Math.hypot(...w), 3)}\\), argument \\(${T((Math.atan2(w[1], w[0]) * 180) / Math.PI, 3)}^\\circ\\).`,
      ]);
    }
  }
  // Multiplication by a constant c is the linear map with matrix ( a −b ; b a ).
  const c = m.f(1, 0);
  const linear = c.every(Number.isFinite) && [[0.3, -0.7], [-1.1, 0.4]].every(([x, y]) => {
    const w = m.f(x, y);
    return Math.abs(w[0] - (c[0] * x - c[1] * y)) < 1e-9 && Math.abs(w[1] - (c[1] * x + c[0] * y)) < 1e-9;
  });
  items.push([
    'Related',
    linear
      ? `\\(f(z) = c\\,z\\) with \\(c = ${complexTex(c)}\\) turns the plane by \\(\\arg c\\) and stretches it by \\(|c|\\): it is the <a href="./linear-maps.html#${mapsHash(c)}">linear map</a> with matrix \\(\\begin{pmatrix} a & -b \\\\ b & a \\end{pmatrix}\\).`
      : 'Multiplying by a fixed complex number turns and stretches the plane: try \\((1 + i) z\\), which is a <a href="./linear-maps.html">linear map</a> of the plane.',
  ]);
  setFacts(items);
}

// --- Update and wiring -----------------------------------------------------------------

function update() {
  const state = readForm();
  const m = getModel(state);
  if (m.error) {
    $('status').textContent = m.error;
    for (const svg of [zSvg, wSvg]) frame(svg, MARGIN);
    zCanvas.getContext('2d').clearRect(0, 0, zCanvas.width, zCanvas.height);
    delete zCanvas.dataset.key;
    zView = null;
    $('formula').innerHTML = '';
    setFacts([]);
    writeHash(state);
    return;
  }
  $('status').textContent = '';
  setTex($('formula'), `f(z) = ${m.fTex}`);
  drawZ(m);
  drawW(m);
  facts(m);
  writeHash(state);
}

function zoom(factor) {
  const m = getModel(readForm());
  if (m.error) return;
  const { xMin, xMax, yMin, yMax } = m.box;
  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;
  const round = (v) => +v.toPrecision(6);
  writeForm({
    xMin: round(cx - ((xMax - xMin) / 2) * factor),
    xMax: round(cx + ((xMax - xMin) / 2) * factor),
    yMin: round(cy - ((yMax - yMin) / 2) * factor),
    yMax: round(cy + ((yMax - yMin) / 2) * factor),
  });
  $('preset').value = '';
  update();
}
$('zoomIn').addEventListener('click', () => zoom(0.5));
$('zoomOut').addEventListener('click', () => zoom(2));

let debounce = null;
$('controls').addEventListener('input', (e) => {
  const t = e.target;
  if (Object.keys(fields).includes(t.id)) {
    $('preset').value = '';
    clearTimeout(debounce);
    debounce = setTimeout(update, 250);
  } else if (t.id === 'preset') {
    const preset = PRESETS[t.value];
    if (!preset) return;
    const { label, ...values } = preset;
    writeForm(values);
    probe = null;
    update();
  }
});
$('controls').addEventListener('submit', (e) => e.preventDefault());

const resize = new ResizeObserver(() => update());
resize.observe(zSvg);
resize.observe(wSvg);

renderStatic();
writeForm(stateFromHash(DEFAULTS));
update();
