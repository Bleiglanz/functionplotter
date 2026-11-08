import { renderStatic, setTex, texNum as T } from './tex.js';
import { svgEl, svgTex, num, frame, arrow, equalScale, setFacts, serializeHash, stateFromHash, writeHash } from './pageUtils.js';
import { apply, det, inverse, towards, classify } from './linearMath.js';

// Page for linear maps of the plane: the unit square, a grid and a letter F
// under a 2×2 matrix A, whose columns are the images of e₁ and e₂ (drag
// them). t moves from the identity (t = 0) to A (t = 1).

// The matrix is ( a b ; c d ) under the hash keys a, b, c, d (see AGENTS.md).
const DEFAULTS = { a: 1.5, b: 0.5, c: 0.25, d: 1, t: 1 };
const PRESETS = [
  { label: 'A general map', a: 1.5, b: 0.5, c: 0.25, d: 1 },
  { label: 'Rotation by 30°', a: 0.866, b: -0.5, c: 0.5, d: 0.866 },
  { label: 'Shear along x', a: 1, b: 1, c: 0, d: 1 },
  { label: 'Stretch x by 2, shrink y by half', a: 2, b: 0, c: 0, d: 0.5 },
  { label: 'Reflection in the line y = x', a: 0, b: 1, c: 1, d: 0 },
  { label: 'Projection onto the x-axis: det 0', a: 1, b: 0, c: 0, d: 0 },
  { label: 'Collapse onto a line: det 0', a: 1, b: 2, c: 0.5, d: 1 },
  { label: 'Rotation by 90° and scaling by 1.5', a: 0, b: -1.5, c: 1.5, d: 0 },
];
const SNAP = 0.05; // dragged columns snap to this grid
const GRID = 6; // grid lines at −6 … 6
const HIT = 16; // pixels around a column's tip that start a drag
const ANIMATE_MS = 1600;
const MARGIN = { top: 12, right: 12, bottom: 26, left: 36 };
// A letter F in the unit square, as a polygon.
const LETTER = [
  [0.2, 0.15], [0.35, 0.15], [0.35, 0.45], [0.6, 0.45], [0.6, 0.58], [0.35, 0.58],
  [0.35, 0.75], [0.7, 0.75], [0.7, 0.88], [0.2, 0.88],
];

const $ = (id) => document.getElementById(id);
const fields = { a: $('a'), b: $('b'), c: $('c'), d: $('d'), t: $('t') };
const tSlider = $('tSlider');
const svg = document.querySelector('#chart > svg');

for (const [i, preset] of PRESETS.entries()) $('preset').add(new Option(preset.label, i));

function readForm() {
  const state = {};
  for (const key of Object.keys(fields)) state[key] = parseFloat(fields[key].value);
  return state;
}

function writeForm(state) {
  for (const key of Object.keys(fields)) if (key in state) fields[key].value = state[key];
}

/** The matrix and t from the form, with defaults for fields that aren't numbers. */
function clampState(raw) {
  const state = {};
  for (const key of ['a', 'b', 'c', 'd']) state[key] = Number.isFinite(raw[key]) ? raw[key] : DEFAULTS[key];
  state.t = Number.isFinite(raw.t) ? Math.min(1, Math.max(0, raw.t)) : 1;
  return state;
}

const matrixOf = ({ a, b, c, d }) => [a, b, c, d];

/** Half the side of the square view: big enough for the columns and the square's image. */
function viewRadius(A) {
  const [a, b, c, d] = A;
  return Math.max(2.5, 1.25 * Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), Math.abs(a + b), Math.abs(c + d)));
}

// --- Chart -------------------------------------------------------------------------------

let view = null; // the current mapping, read by the pointer code
let fixedRadius = null; // kept while dragging, so the view doesn't move under the pointer

function draw(state) {
  const box = frame(svg, MARGIN);
  view = null;
  if (!box) return;
  const A = matrixOf(state);
  const M = towards(A, state.t); // what is drawn
  const R = fixedRadius ?? viewRadius(A);
  const v = equalScale(box, -R, R, -R, R);
  const { sx, sy } = v;
  const P = ([x, y]) => [sx(x), sy(y)];

  // Background grid and tick labels at whole numbers.
  const grid = svgEl('g', { class: 'grid' }, svg);
  const labels = svgEl('g', { class: 'tick-labels' }, svg);
  const step = R > 8 ? 2 : 1;
  for (let k = Math.ceil(v.xMin / step) * step; k <= v.xMax; k += step) {
    svgEl('line', { x1: sx(k), x2: sx(k), y1: MARGIN.top, y2: MARGIN.top + box.plotH, class: k === 0 ? 'zero' : '' }, grid);
    if (k !== 0) svgEl('text', { x: sx(k), y: box.height - 8, 'text-anchor': 'middle' }, labels).textContent = num(k);
  }
  for (let k = Math.ceil(v.yMin / step) * step; k <= v.yMax; k += step) {
    svgEl('line', { x1: MARGIN.left, x2: MARGIN.left + box.plotW, y1: sy(k), y2: sy(k), class: k === 0 ? 'zero' : '' }, grid);
    if (k !== 0) svgEl('text', { x: MARGIN.left - 6, y: sy(k), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, labels).textContent = num(k);
  }

  const plot = svgEl('g', { 'clip-path': box.clipUrl }, svg);
  // The image of the grid: lines map to lines, so each is the segment between two images.
  const gridImage = svgEl('g', { class: 'grid-image' }, plot);
  const far = Math.ceil(R / Math.max(1e-9, Math.min(1, Math.abs(det(M)) || 1))) + GRID;
  for (let k = -GRID * step; k <= GRID * step; k += step) {
    for (const [p, q] of [
      [[k, -far], [k, far]],
      [[-far, k], [far, k]],
    ]) {
      const [x1, y1] = P(apply(M, p));
      const [x2, y2] = P(apply(M, q));
      svgEl('line', { x1, y1, x2, y2, class: k === 0 ? 'axis' : '' }, gridImage);
    }
  }

  // Unit square and letter F, before (faint) and after.
  const poly = (pts) => pts.map((p) => P(p).map((c) => c.toFixed(1)).join(',')).join(' ');
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
  svgEl('polygon', { points: poly(square), class: 'square' }, plot);
  svgEl('polygon', { points: poly(LETTER), class: 'letter' }, plot);
  svgEl('polygon', { points: poly(square.map((p) => apply(M, p))), class: 'square-image' }, plot);
  svgEl('polygon', { points: poly(LETTER.map((p) => apply(M, p))), class: 'letter-image' }, plot);

  // e₁, e₂ (faint) and their images, the columns of M.
  const o = P([0, 0]);
  arrow(plot, ...o, ...P([1, 0]), { cls: 'basis' });
  arrow(plot, ...o, ...P([0, 1]), { cls: 'basis' });
  const col1 = apply(M, [1, 0]);
  const col2 = apply(M, [0, 1]);
  arrow(plot, ...o, ...P(col1), { cls: 'e1', head: 11 });
  arrow(plot, ...o, ...P(col2), { cls: 'e2', head: 11 });
  const tag = state.t === 1 ? 'A' : 'A_t';
  labelAt(plot, P(col1), col1, `${tag}e_1`, 'e1-label');
  labelAt(plot, P(col2), col2, `${tag}e_2`, 'e2-label');
  // Grab areas at the two tips (outlined on hover).
  for (const c of [col1, col2]) {
    const [cx, cy] = P(c);
    svgEl('circle', { cx, cy, r: HIT, class: 'handle' }, plot);
  }

  view = { box, v, col1, col2, R };
  svg.setAttribute('aria-label', `The plane under the matrix with columns (${num(col1[0])}, ${num(col1[1])}) and (${num(col2[0])}, ${num(col2[1])})`);
}

/** A label next to a vector's tip, pushed outward along the vector. */
function labelAt(parent, [px, py], [x, y], tex, cls) {
  const r = Math.hypot(x, y) || 1;
  const ux = x / r;
  const uy = -y / r;
  svgTex(parent, px + ux * 10, py + uy * 10, tex, {
    anchor: ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle',
    baseline: uy > 0.3 ? 'top' : uy < -0.3 ? 'bottom' : 'middle',
    cls,
  });
}

// --- Pointer and keyboard -------------------------------------------------------------

let dragging = null; // 'col1' | 'col2' while dragging a column

function pointerMath(e) {
  const rect = svg.getBoundingClientRect();
  return view.v.toMath(e.clientX - rect.left, e.clientY - rect.top);
}

function nearColumn(e) {
  const rect = svg.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  let best = null;
  for (const key of ['col1', 'col2']) {
    const [x, y] = view[key];
    const dist = Math.hypot(view.v.sx(x) - px, view.v.sy(y) - py);
    if (dist <= HIT && (!best || dist < best.dist)) best = { key, dist };
  }
  return best?.key ?? null;
}

const snap = (v) => +(Math.round(v / SNAP) * SNAP).toFixed(2);

svg.addEventListener('pointerdown', (e) => {
  if (!view) return;
  const key = nearColumn(e);
  if (!key) return;
  stopPlay();
  dragging = key;
  fixedRadius = view.R;
  svg.setPointerCapture(e.pointerId);
  svg.style.cursor = 'grabbing';
});
svg.addEventListener('pointermove', (e) => {
  if (!view) return;
  const [x, y] = pointerMath(e);
  if (dragging) {
    const [sxv, syv] = [snap(x), snap(y)];
    if (dragging === 'col1') writeForm({ a: sxv, c: syv, t: 1 });
    else writeForm({ b: sxv, d: syv, t: 1 });
    $('preset').value = '';
    update();
  } else {
    svg.style.cursor = nearColumn(e) ? 'grab' : '';
  }
  const M = towards(matrixOf(clampState(readForm())), clampState(readForm()).t);
  const [ix, iy] = apply(M, [x, y]);
  setTex($('hover'), `\\begin{pmatrix} ${T(x, 3)} \\\\ ${T(y, 3)} \\end{pmatrix} \\mapsto \\begin{pmatrix} ${T(ix, 3)} \\\\ ${T(iy, 3)} \\end{pmatrix}`);
});
const endDrag = () => {
  dragging = null;
  fixedRadius = null;
  svg.style.cursor = '';
  update();
};
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);
svg.addEventListener('pointerleave', () => {
  if (!dragging) $('hover').innerHTML = '';
});
svg.addEventListener('keydown', (e) => {
  if (!view || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  stopPlay();
  const { t } = clampState(readForm());
  setT(t + (e.key === 'ArrowLeft' ? -0.05 : 0.05));
  setTex($('hover'), `t = ${T(clampState(readForm()).t, 2)}`);
});

// --- Explanation ---------------------------------------------------------------------

const vec = ([x, y], digits = 3) => `\\begin{pmatrix} ${T(x, digits)} \\\\ ${T(y, digits)} \\end{pmatrix}`;
const mat = ([a, b, c, d], digits = 3) => `\\begin{pmatrix} ${T(a, digits)} & ${T(b, digits)} \\\\ ${T(c, digits)} & ${T(d, digits)} \\end{pmatrix}`;

function describe(kind) {
  switch (kind.kind) {
    case 'identity':
      return 'This is the identity: every vector stays where it is.';
    case 'zero':
      return 'The zero matrix sends every vector to the origin.';
    case 'scaling':
      return `A multiple of the identity: every vector is scaled by \\(${T(kind.factor, 3)}\\)` + (kind.factor < 0 ? ', which also turns it around (a half turn).' : '.');
    case 'stretch':
      return `A diagonal matrix: the \\(x\\)-direction is scaled by \\(${T(kind.factors[0], 3)}\\), the \\(y\\)-direction by \\(${T(kind.factors[1], 3)}\\).`;
    case 'rotation':
      return `A rotation by \\(${T(kind.angle, 3)}^\\circ\\)` + (Math.abs(kind.scale - 1) > 1e-6 ? `, combined with scaling by \\(${T(kind.scale, 3)}\\)` : '') + ': angles between vectors are kept.';
    case 'reflection':
      return `A reflection in the line through 0 at \\(${T(kind.axis, 3)}^\\circ\\)` + (Math.abs(kind.scale - 1) > 1e-6 ? `, combined with scaling by \\(${T(kind.scale, 3)}\\)` : '') + ': the F appears mirrored.';
    case 'shear':
      return kind.axis === 'x'
        ? `A shear along the \\(x\\)-axis: each point slides sideways by \\(${T(kind.amount, 3)}\\) times its height, and horizontal lines stay where they are.`
        : `A shear along the \\(y\\)-axis: each point slides up by \\(${T(kind.amount, 3)}\\) times its \\(x\\), and vertical lines stay where they are.`;
    case 'singular':
      return 'The columns are parallel, so the whole plane is squashed onto one line.';
    default:
      return null;
  }
}

/** The eigenvector page's hash for this matrix, escaped for an href. */
function eigenHash({ a, b, c, d }) {
  return serializeHash({ a, b, c, d, theta: 60 }).replaceAll('&', '&amp;');
}

function facts(state) {
  const A = matrixOf(state);
  const D = det(A);
  const items = [];
  items.push([
    'The columns',
    `The first column \\(${vec([A[0], A[2]])}\\) is where \\(e_1 = ${vec([1, 0], 1)}\\) lands, the second \\(${vec([A[1], A[3]])}\\) is where \\(e_2\\) lands. ` +
      'Every other vector follows from these two: \\(A(x, y) = x\\,Ae_1 + y\\,Ae_2\\), which is why the grid of whole numbers maps to a grid of parallelograms.',
  ]);
  items.push([
    `\\(\\det A = ${T(D, 4)}\\)`,
    Math.abs(D) < 1e-9
      ? 'The unit square is squashed flat (area 0): \\(A\\) has no inverse, because many vectors land on the same point.'
      : `The unit square becomes a parallelogram of area \\(|{\\det A}| = ${T(Math.abs(D), 4)}\\), and every area is multiplied by this factor. ` +
        (D < 0 ? 'The sign is negative: \\(A\\) flips orientation, so the F appears mirrored and \\(Ae_2\\) is clockwise from \\(Ae_1\\).' : 'The sign is positive: \\(A\\) keeps orientation, and the F still reads the right way round.'),
  ]);
  const kind = describe(classify(A));
  if (kind) items.push(['What it does', kind]);
  const inv = inverse(A);
  if (inv) {
    items.push([
      'Undoing it',
      `\\(A^{-1} = \\frac{1}{\\det A}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix} = ${mat(inv)}\\) maps every image back to where it came from.`,
    ]);
  }
  if (state.t < 1) {
    items.push([
      `\\(t = ${T(state.t, 2)}\\)`,
      '\\(A_t = (1 - t)\\,I + t\\,A\\) moves from the identity to \\(A\\). Every \\(A_t\\) is linear too: lines stay lines and the origin stays put.',
    ]);
  }
  items.push([
    'Related',
    `Which directions does \\(A\\) leave on their own line? See the <a href="./eigenvectors.html#${eigenHash(state)}">eigenvectors</a> page with this matrix.`,
  ]);
  setFacts(items);
}

// --- Update and wiring -----------------------------------------------------------------

function update() {
  const raw = readForm();
  const state = clampState(raw);
  if (state.t !== raw.t) fields.t.value = state.t;
  tSlider.value = state.t;
  $('status').textContent = Object.keys(fields).some((k) => !Number.isFinite(raw[k])) ? 'Enter a number in each field of the matrix.' : '';
  setTex($('formula'), `A = ${mat(matrixOf(state))}`);
  draw(state);
  facts(state);
  writeHash(state);
}

function setT(t) {
  fields.t.value = +Math.min(1, Math.max(0, t)).toFixed(2);
  update();
}

let frameId = null;
function stopPlay() {
  cancelAnimationFrame(frameId);
  frameId = null;
  $('play').setAttribute('aria-pressed', 'false');
}
$('play').addEventListener('click', () => {
  if (frameId) return stopPlay();
  $('play').setAttribute('aria-pressed', 'true');
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ANIMATE_MS);
    setT(t);
    if (t < 1) frameId = requestAnimationFrame(step);
    else stopPlay();
  };
  frameId = requestAnimationFrame(step);
});

$('controls').addEventListener('input', (e) => {
  const t = e.target;
  stopPlay();
  if (t === tSlider) {
    setT(+tSlider.value);
  } else if (t.id === 'preset') {
    const preset = PRESETS[t.value];
    if (!preset) return;
    const { label, ...values } = preset;
    writeForm({ ...values, t: 1 });
    update();
  } else {
    if (['a', 'b', 'c', 'd'].includes(t.id)) $('preset').value = '';
    update();
  }
});
$('controls').addEventListener('submit', (e) => e.preventDefault());

new ResizeObserver(() => update()).observe(svg);

renderStatic();
writeForm(stateFromHash(DEFAULTS));
update();
