import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { niceTicks } from './format.js';
import { renderStatic, setTex, texText, texNum as T, texSigned as S } from './tex.js';
import { svgEl, svgTex, num, frame, axes, arrow, equalScale, setFacts, stateFromHash, writeHash } from './pageUtils.js';
import { fromLatLon, toLatLon, project, unproject, parallelRadius, normalizeLatLon } from './stereographicMath.js';

// Page for the stereographic projection from the north pole N = (0, 0, 1) of
// the unit sphere onto the plane of its equator, read as the complex plane.
// The main chart is a three.js scene (sphere, plane, the line from N through
// P to z) with KaTeX labels laid over the canvas; the second chart is the
// plane seen from above. Clicking either chooses P; the latitude and
// longitude fields hold the state.

const DEFAULTS = { lat: 30, lon: 40, grid: true };
const PRESETS = [
  { label: 'South pole S: z = 0', lat: -90, lon: 0 },
  { label: 'Southern hemisphere: inside the unit circle', lat: -35, lon: -60 },
  { label: 'On the equator: z = 1', lat: 0, lon: 0 },
  { label: 'On the equator: z = i', lat: 0, lon: 90 },
  { label: 'Northern hemisphere: outside the unit circle', lat: 35, lon: 135 },
  { label: 'Close to N: |z| is large', lat: 80, lon: 30 },
  { label: 'North pole N: z = ∞', lat: 90, lon: 0 },
];
const PLANE_R = 2.5; // half the side of the square of plane drawn in 3D
const VIEW_R = 3; // the plane chart shows at least |x|, |y| ≤ VIEW_R
const RAY_MAX = 40; // the line from N is drawn at most this far out
const GRID_LATS = [-60, -30, 30, 60]; // parallels besides the equator
const GRID_LONS = Array.from({ length: 12 }, (_, i) => -180 + 30 * (i + 1));
const CIRCLE_SAMPLES = 160;
const PLAY_STEP = 1.5; // degrees of latitude per frame of "Move P up to N"
const PLAY_MS = 40;
const MARGIN = { top: 12, right: 12, bottom: 26, left: 40 };

const $ = (id) => document.getElementById(id);
const fields = { lat: $('lat'), lon: $('lon'), grid: $('grid') };
const sliders = { lat: $('latSlider'), lon: $('lonSlider') };
const sceneEl = $('scene');
const canvas = sceneEl.querySelector('canvas');
const labelsEl = sceneEl.querySelector('.labels');
const planeSvg = document.querySelector('#planeChart > svg');

for (const [i, preset] of PRESETS.entries()) $('preset').add(new Option(preset.label, i));

function readForm() {
  return { lat: parseFloat(fields.lat.value), lon: parseFloat(fields.lon.value), grid: fields.grid.checked };
}

function writeForm({ lat, lon, grid }) {
  fields.lat.value = lat;
  fields.lon.value = lon;
  if (grid !== undefined) fields.grid.checked = grid;
}

/** The state of the form, cleaned up: finite, latitude clamped, longitude wrapped. */
function currentState() {
  const raw = readForm();
  const { lat, lon } = normalizeLatLon(Number.isFinite(raw.lat) ? raw.lat : DEFAULTS.lat, Number.isFinite(raw.lon) ? raw.lon : DEFAULTS.lon);
  return { lat, lon, grid: raw.grid };
}

/** Rounds to 0.1°, so clicked points give short numbers in the fields and the link. */
const round1 = (v) => Math.round(v * 10) / 10;

function setLatLon(lat, lon) {
  const n = normalizeLatLon(round1(lat), round1(lon));
  writeForm(n);
  $('preset').value = '';
  update();
}

function setFromZ(x, y) {
  const { lat, lon } = toLatLon(unproject(x, y));
  setLatLon(lat, lon);
}

// --- TeX helpers ----------------------------------------------------------------------

/** x + iy as TeX, leaving out a part that rounds to 0. */
function complexTex(x, y, digits = 3) {
  const tiny = 5e-4 * Math.max(1, Math.abs(x), Math.abs(y));
  const ax = Math.abs(x) < tiny ? 0 : x;
  const ay = Math.abs(y) < tiny ? 0 : y;
  if (ay === 0) return T(ax, digits);
  const im = Math.abs(ay) === 1 ? 'i' : `${T(Math.abs(ay), digits)}i`;
  if (ax === 0) return `${ay < 0 ? '-' : ''}${im}`;
  return `${T(ax, digits)} ${ay < 0 ? '-' : '+'} ${im}`;
}

const tidy = (v) => (Math.abs(v) < 5e-4 ? 0 : v);
const pointTex = ([X, Y, Z]) => `(${T(tidy(X), 3)},\\ ${T(tidy(Y), 3)},\\ ${T(tidy(Z), 3)})`;

// --- 3D scene ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
camera.up.set(0, 0, 1); // +Z is up, as in the math
camera.position.set(4.7, -5.6, 3.3);
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.minDistance = 3;
controls.maxDistance = 30;
controls.addEventListener('change', render);

scene.add(new THREE.AmbientLight(0xffffff, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(3, -4, 6);
scene.add(sun);

let colors = null;
function readColors() {
  const css = getComputedStyle(document.documentElement);
  const get = (name) => new THREE.Color(css.getPropertyValue(name).trim() || '#888');
  return {
    text: get('--text'),
    muted: get('--muted'),
    border: get('--border'),
    accent: get('--accent'),
    parallel: get('--slice-x'),
    meridian: get('--slice-y'),
  };
}

const sphereMat = new THREE.MeshPhongMaterial({ transparent: true, opacity: 0.22, depthWrite: false, shininess: 40 });
const sphereMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 48), sphereMat);
const planeMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
const planeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * PLANE_R, 2 * PLANE_R), planeMat);
scene.add(sphereMesh, planeMesh);

const staticGroup = new THREE.Group(); // plane grid, equator
const gridGroup = new THREE.Group(); // parallels, meridians and their images
const pointGroup = new THREE.Group(); // everything that depends on P
scene.add(staticGroup, gridGroup, pointGroup);

const dotGeo = new THREE.SphereGeometry(0.045, 20, 14);
const hoverMarker = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8 }));
hoverMarker.visible = false;
scene.add(hoverMarker);

function disposeGroup(group) {
  for (const obj of group.children) {
    if (obj.geometry && obj.geometry !== dotGeo) obj.geometry.dispose();
    obj.material?.dispose();
  }
  group.clear();
}

/** A fat polyline through 3D points (screen-space width in pixels). */
function fatLine(points, color, linewidth, opacity = 1) {
  const geo = new LineGeometry();
  geo.setPositions(points.flat());
  const mat = new LineMaterial({ color, linewidth, transparent: opacity < 1, opacity });
  return new Line2(geo, mat);
}

/** A thin polyline, for the many grid lines. */
function thinLine(points, color, opacity) {
  const geo = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

/** Splits a plane polyline (Z = 0) into the runs that lie inside the drawn square. */
function runsInSquare(points) {
  const runs = [];
  let run = [];
  for (const p of points) {
    if (Math.abs(p[0]) <= PLANE_R && Math.abs(p[1]) <= PLANE_R) run.push(p);
    else {
      if (run.length > 1) runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

const circle = (r, z = 0) => Array.from({ length: CIRCLE_SAMPLES + 1 }, (_, i) => {
  const t = (2 * Math.PI * i) / CIRCLE_SAMPLES;
  return [r * Math.cos(t), r * Math.sin(t), z];
});
const parallelPoints = (lat) => circle(Math.cos((lat * Math.PI) / 180), Math.sin((lat * Math.PI) / 180));
const meridianPoints = (lon) => Array.from({ length: 91 }, (_, i) => fromLatLon(-90 + 2 * i, lon));
const rayPoints = (lon) => {
  const t = (lon * Math.PI) / 180;
  return Array.from({ length: 41 }, (_, i) => [(2 * PLANE_R * i * Math.cos(t)) / 40, (2 * PLANE_R * i * Math.sin(t)) / 40, 0]);
};

function buildStatic() {
  disposeGroup(staticGroup);
  sphereMat.color.copy(colors.accent);
  planeMat.color.copy(colors.muted);
  hoverMarker.material.color.copy(colors.muted);
  const lines = [];
  for (let v = -PLANE_R; v <= PLANE_R + 1e-9; v += 0.5) {
    lines.push([v, -PLANE_R, 0], [v, PLANE_R, 0], [-PLANE_R, v, 0], [PLANE_R, v, 0]);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(lines.map((p) => new THREE.Vector3(...p)));
  staticGroup.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: colors.muted, transparent: true, opacity: 0.25 })));
  // The equator lies in the plane: it is its own image, the unit circle.
  staticGroup.add(fatLine(circle(1), colors.text, 2));
}

function buildGrid(show) {
  disposeGroup(gridGroup);
  if (!show) return;
  for (const lat of GRID_LATS) {
    gridGroup.add(thinLine(parallelPoints(lat), colors.muted, 0.45));
    for (const run of runsInSquare(circle(parallelRadius(lat)))) gridGroup.add(thinLine(run, colors.muted, 0.3));
  }
  for (const lon of GRID_LONS) {
    gridGroup.add(thinLine(meridianPoints(lon), colors.muted, 0.45));
    for (const run of runsInSquare(rayPoints(lon))) gridGroup.add(thinLine(run, colors.muted, 0.3));
  }
}

const labels = {};
for (const [name, src, cls] of [
  ['N', 'N', ''],
  ['S', 'S', ''],
  ['P', 'P', ''],
  ['z', 'z', 'ray'],
]) {
  const el = document.createElement('div');
  if (cls) el.className = cls;
  setTex(el, src);
  labelsEl.append(el);
  labels[name] = { el, at: null };
}

function buildPoint({ lat, lon }) {
  disposeGroup(pointGroup);
  const P = fromLatLon(lat, lon);
  const z = project(P, 1e-9);
  const dot = (p, color) => {
    const m = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color }));
    m.position.set(...p);
    pointGroup.add(m);
  };
  const pole = Math.abs(lat) >= 90 - 1e-9;
  if (!pole) {
    pointGroup.add(fatLine(parallelPoints(lat), colors.parallel, 2.5));
    pointGroup.add(fatLine(meridianPoints(lon), colors.meridian, 2.5));
    for (const run of runsInSquare(circle(parallelRadius(lat)))) pointGroup.add(fatLine(run, colors.parallel, 2.5));
    for (const run of runsInSquare(rayPoints(lon))) pointGroup.add(fatLine(run, colors.meridian, 2.5));
  }
  dot([0, 0, 1], colors.text);
  dot([0, 0, -1], colors.text);
  labels.N.at = [0, 0, 1];
  labels.S.at = [0, 0, -1];
  labels.P.at = z ? P : null; // at N the label N says it
  labels.P.el.classList.toggle('below', lat > 60); // keep it clear of N's label
  labels.z.at = null;
  if (z) {
    // The line from N to whichever of P and z is farther: z lies beyond P for
    // the northern hemisphere and between N and P for the southern. A far z
    // is cut off at RAY_MAX from the axis.
    const horiz = Math.hypot(P[0], P[1]);
    const t = Math.max(1, Math.min(1 / (1 - P[2]), horiz > 0 ? RAY_MAX / horiz : Infinity));
    const end = [t * P[0], t * P[1], 1 + t * (P[2] - 1)];
    pointGroup.add(fatLine([[0, 0, 1], end], colors.accent, 3));
    dot(P, colors.accent);
    if (Math.hypot(...z) <= RAY_MAX) {
      dot([z[0], z[1], 0], colors.accent);
      labels.z.at = [z[0], z[1], 0];
    }
  }
}

function placeLabels(w, h) {
  const v = new THREE.Vector3();
  for (const { el, at } of Object.values(labels)) {
    if (!at) {
      el.hidden = true;
      continue;
    }
    v.set(...at).project(camera);
    const inside = v.z < 1 && Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05;
    el.hidden = !inside;
    el.style.left = `${((v.x + 1) / 2) * w}px`;
    el.style.top = `${((1 - v.y) / 2) * h}px`;
  }
}

function render() {
  const w = sceneEl.clientWidth;
  const h = sceneEl.clientHeight;
  if (!w || !h) return;
  renderer.render(scene, camera);
  placeLabels(w, h);
}

function resizeScene() {
  const w = sceneEl.clientWidth;
  const h = sceneEl.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  render();
}

// --- Picking in 3D ------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();

/** The sphere or plane point under the pointer, as { lat, lon }, or null. */
function pickAt(e) {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects([sphereMesh, planeMesh], false)[0];
  if (!hit) return null;
  if (hit.object === sphereMesh) return toLatLon(hit.point.clone().normalize().toArray());
  return toLatLon(unproject(hit.point.x, hit.point.y));
}

let downAt = null;
canvas.addEventListener('pointerdown', (e) => {
  downAt = [e.clientX, e.clientY];
});
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 4) return; // an orbit drag, not a click
  const hit = pickAt(e);
  if (hit) {
    stopPlay();
    setLatLon(hit.lat, hit.lon);
  }
});

let hover = null; // { lat, lon } under the pointer in either chart
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) return;
  hover = pickAt(e);
  showHover();
});
canvas.addEventListener('pointerleave', () => {
  hover = null;
  showHover();
});

function showHover() {
  if (!hover) {
    hoverMarker.visible = false;
    $('hover').innerHTML = '';
    $('planeHover').innerHTML = '';
  } else {
    const P = fromLatLon(hover.lat, hover.lon);
    const z = project(P, 1e-9);
    hoverMarker.position.set(...P);
    hoverMarker.visible = true;
    const text = `\\varphi = ${T(hover.lat, 3)}^\\circ \\quad \\lambda = ${T(hover.lon, 3)}^\\circ \\quad z = ${z ? complexTex(...z) : '\\infty'}`;
    setTex($('hover'), text);
    setTex($('planeHover'), text);
  }
  render();
  drawPlane();
}

// --- Keyboard (both charts) -------------------------------------------------------------

function onKey(e) {
  const keys = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [1, 0], ArrowDown: [-1, 0] };
  const step = keys[e.key];
  if (!step) return;
  e.preventDefault();
  stopPlay();
  const d = e.shiftKey ? 1 : 5;
  const { lat, lon } = currentState();
  setLatLon(lat + step[0] * d, lon + step[1] * d);
}
sceneEl.addEventListener('keydown', onKey);
planeSvg.addEventListener('keydown', onKey);

// --- Plane chart ---------------------------------------------------------------------------

let plane = null;

function drawPlane() {
  const box = frame(planeSvg, MARGIN);
  plane = null;
  if (!box) return;
  const { lat, lon, grid } = currentState();
  const v = equalScale(box, -VIEW_R, VIEW_R, -VIEW_R, VIEW_R);
  const xTicks = niceTicks(v.xMin, v.xMax, 6).ticks.filter((t) => t >= v.xMin && t <= v.xMax);
  axes(planeSvg, box, xTicks.map((t) => [t, v.sx(t)]), v.yMin, v.yMax, v.sy, niceTicks(v.yMin, v.yMax, 6).ticks);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, planeSvg);
  const [ox, oy] = [v.sx(0), v.sy(0)];
  const far = 2 * Math.hypot(v.xMax - v.xMin, v.yMax - v.yMin) * v.scale;
  const ray = (deg, cls) => {
    const t = (deg * Math.PI) / 180;
    svgEl('line', { x1: ox, y1: oy, x2: ox + far * Math.cos(t), y2: oy - far * Math.sin(t), class: cls }, plot);
  };
  if (grid) {
    for (const la of GRID_LATS) svgEl('circle', { cx: ox, cy: oy, r: parallelRadius(la) * v.scale, class: 'image-grid' }, plot);
    for (const lo of GRID_LONS) ray(lo, 'image-grid');
  }
  svgEl('circle', { cx: ox, cy: oy, r: v.scale, class: 'equator' }, plot);
  const pole = Math.abs(lat) >= 90 - 1e-9;
  if (!pole) {
    svgEl('circle', { cx: ox, cy: oy, r: parallelRadius(lat) * v.scale, class: 'parallel' }, plot);
    ray(lon, 'meridian');
  }
  svgEl('circle', { cx: ox, cy: oy, r: 3.5, class: 'origin' }, plot);
  svgTex(plot, ox - 4, oy + 4, 'S \\mapsto 0', { anchor: 'end', baseline: 'top', cls: 'muted-label' });

  const z = project(fromLatLon(lat, lon), 1e-9);
  if (!z) {
    svgTex(plot, ox, MARGIN.top + 6, 'P = N:\\ z = \\infty,\\ \\text{not in the plane}', { anchor: 'middle', baseline: 'top', cls: 'z-label' });
  } else {
    const px = v.sx(z[0]);
    const py = v.sy(z[1]);
    const inside = z[0] >= v.xMin && z[0] <= v.xMax && z[1] >= v.yMin && z[1] <= v.yMax;
    if (inside) {
      svgEl('circle', { cx: px, cy: py, r: 5.5, class: 'zpoint' }, plot);
      svgTex(plot, px + 7, py - 4, 'z', { cls: 'z-label' });
    } else {
      // Point at z from inside the edge of the chart, with its size.
      const r = Math.hypot(...z);
      const reach = 0.9 * Math.min(v.xMax - v.xMin, v.yMax - v.yMin) / 2;
      const ux = z[0] / r;
      const uy = z[1] / r;
      const tip = [v.sx(reach * ux), v.sy(reach * uy)];
      const tail = [v.sx(0.72 * reach * ux), v.sy(0.72 * reach * uy)];
      arrow(plot, ...tail, ...tip, { cls: 'far', head: 10 });
      // The label goes in a corner away from the arrow, so it crosses no circle.
      const left = ux > 0;
      svgTex(plot, left ? MARGIN.left + 6 : MARGIN.left + box.plotW - 6, uy > 0 ? MARGIN.top + box.plotH - 6 : MARGIN.top + 6, `z \\text{ is outside the view: } |z| = ${T(r, 3)}`, {
        anchor: left ? 'start' : 'end',
        baseline: uy > 0 ? 'bottom' : 'top',
        cls: 'z-label',
      });
    }
  }
  if (hover) {
    const hz = project(fromLatLon(hover.lat, hover.lon), 1e-9);
    if (hz) svgEl('circle', { cx: v.sx(hz[0]), cy: v.sy(hz[1]), r: 6, class: 'hover-dot' }, plot);
  }
  plane = { v };
  planeSvg.setAttribute('aria-label', z ? `The complex plane with z = ${num(z[0], 3)} + ${num(z[1], 3)} i` : 'The complex plane; P is the north pole, so z is infinity');
}

const planeAt = (e) => {
  const rect = planeSvg.getBoundingClientRect();
  return plane.v.toMath(e.clientX - rect.left, e.clientY - rect.top);
};
planeSvg.addEventListener('pointermove', (e) => {
  if (!plane) return;
  hover = toLatLon(unproject(...planeAt(e)));
  showHover();
});
planeSvg.addEventListener('pointerleave', () => {
  hover = null;
  showHover();
});
planeSvg.addEventListener('click', (e) => {
  if (!plane) return;
  stopPlay();
  setFromZ(...planeAt(e));
});

// --- Explanation ----------------------------------------------------------------------------

function facts({ lat, lon }) {
  const P = fromLatLon(lat, lon);
  const z = project(P, 1e-9);
  const items = [];
  if (!z) {
    items.push([
      'At the north pole',
      '\\(P = N\\): the line from \\(N\\) through \\(N\\) is not defined, and no point of the plane comes from \\(N\\). ' +
        'The lines from \\(N\\) through points close to \\(N\\) are nearly horizontal and meet the plane far out, so \\(N\\) stands for \\(z = \\infty\\).',
    ]);
  } else {
    const [X, Y, Zc] = P;
    items.push([
      'The projection',
      `The line \\(N + t\\,(P - N)\\) reaches the plane \\(Z = 0\\) at \\(t = \\frac{1}{1 - Z}\\), so \\(z = \\frac{X + iY}{1 - Z}\\). ` +
        `Here \\(P = ${pointTex(P)}\\) and \\(z = \\frac{${T(tidy(X), 3)} ${S(tidy(Y), 3)}i}{${T(1 - Zc, 3)}} = ${complexTex(...z)}\\).`,
    ]);
    items.push([
      'Back from the plane',
      `\\(P = \\frac{1}{|z|^2 + 1}\\bigl(2x,\\ 2y,\\ |z|^2 - 1\\bigr)\\): every \\(z\\) comes from exactly one \\(P \\ne N\\). ` +
        'So the projection is a bijection from the sphere without \\(N\\) onto \\(\\mathbb{C}\\). Click the plane to see it run backwards.',
    ]);
    const r = Math.hypot(...z);
    const where =
      Math.abs(lat) < 1e-9
        ? '\\(P\\) is on the equator, so \\(|z| = 1\\): the equator is the unit circle, and it stays where it is.'
        : lat < 0
          ? `\\(P\\) is in the southern hemisphere, so \\(|z| = ${T(r, 3)} < 1\\): the southern hemisphere fills the unit disk, with \\(S \\mapsto 0\\).`
          : `\\(P\\) is in the northern hemisphere, so \\(|z| = ${T(r, 3)} > 1\\): the northern hemisphere covers everything outside the unit circle.`;
    items.push(['Inside or outside', `${where} In general \\(|z| = \\tan\\bigl(45^\\circ + \\tfrac{\\varphi}{2}\\bigr)\\) at latitude \\(\\varphi\\).`]);
  }
  items.push([
    'The point at infinity',
    'As \\(P\\) moves up to \\(N\\), \\(|z|\\) grows without bound, and the caps around \\(N\\) become the regions \\(|z| > R\\). ' +
      'Adding one point \\(\\infty\\) for \\(N\\) turns the sphere into a picture of \\(\\hat{\\mathbb{C}} = \\mathbb{C} \\cup \\{\\infty\\}\\), the Riemann sphere. ' +
      'Try “Move \\(P\\) up to \\(N\\)”.',
  ]);
  items.push([
    'Circles and angles',
    'The parallel through \\(P\\) goes to the circle \\(|z| = \\text{const}\\) about 0, and the meridian to the ray \\(\\arg z = \\lambda\\). ' +
      'In general a circle on the sphere goes to a circle in the plane, or to a line when it passes through \\(N\\) (a meridian with its opposite half is a line through 0). ' +
      'The projection keeps angles: the parallel and the meridian cross at right angles at \\(P\\), and so do their images at \\(z\\).',
  ]);
  items.push([
    'Related',
    'On the <a href="./complex.html">complex functions</a> page a pole of \\(f\\) is where \\(f\\) takes the value \\(\\infty\\): on the Riemann sphere, the north pole.',
  ]);
  setFacts(items);
}

// --- Update and wiring -------------------------------------------------------------------

let builtGrid = null;

function update() {
  const state = currentState();
  const raw = readForm();
  if (raw.lat !== state.lat) fields.lat.value = state.lat;
  if (raw.lon !== state.lon) fields.lon.value = state.lon;
  sliders.lat.value = state.lat;
  sliders.lon.value = state.lon;
  if (builtGrid !== state.grid) {
    buildGrid(state.grid);
    builtGrid = state.grid;
  }
  buildPoint(state);
  const P = fromLatLon(state.lat, state.lon);
  const z = project(P, 1e-9);
  setTex($('formula'), `P = ${z ? pointTex(P) : 'N'} \\;\\mapsto\\; z = ${z ? complexTex(...z) : '\\infty'}`);
  sceneEl.setAttribute(
    'aria-label',
    `Unit sphere and the plane of its equator; P at latitude ${num(state.lat, 3)}°, longitude ${num(state.lon, 3)}°` +
      (z ? `, projected to z = ${num(z[0], 3)} + ${num(z[1], 3)} i` : ', the north pole'),
  );
  render();
  drawPlane();
  facts(state);
  writeHash(state);
}

function applyTheme() {
  colors = readColors();
  buildStatic();
  builtGrid = null;
  update();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

let timer = null;
function stopPlay() {
  clearInterval(timer);
  timer = null;
  $('play').innerHTML = texText('▶ Move \\(P\\) up to \\(N\\)');
  $('play').setAttribute('aria-pressed', 'false');
}
$('play').addEventListener('click', () => {
  if (timer) return stopPlay();
  let { lat, lon } = currentState();
  if (lat >= 90) lat = -90; // start again from the south pole
  setLatLon(lat, lon);
  $('play').textContent = '■ Stop';
  $('play').setAttribute('aria-pressed', 'true');
  timer = setInterval(() => {
    // Slow down near N, where |z| grows fastest.
    lat = Math.min(90, lat + (lat < 70 ? PLAY_STEP : PLAY_STEP / 3));
    writeForm({ lat, lon });
    update();
    if (lat >= 90) stopPlay();
  }, PLAY_MS);
});

$('controls').addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'preset') {
    const preset = PRESETS[t.value];
    if (!preset) return;
    stopPlay();
    writeForm(preset);
    update();
    return;
  }
  stopPlay();
  if (t === sliders.lat) fields.lat.value = sliders.lat.value;
  if (t === sliders.lon) fields.lon.value = sliders.lon.value;
  if (t !== fields.grid) $('preset').value = '';
  update();
});
$('controls').addEventListener('submit', (e) => e.preventDefault());

const resize = new ResizeObserver(() => {
  resizeScene();
  drawPlane();
});
resize.observe(sceneEl);
resize.observe(planeSvg);

renderStatic();
writeForm(stateFromHash(DEFAULTS));
applyTheme();
