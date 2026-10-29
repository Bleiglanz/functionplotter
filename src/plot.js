import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { sampleSurface, sampleSlice, gridIndices, partials, tangentBasis, geodesic } from './surface.js';
import { formatNumber as fmt } from './format.js';
import { viridis } from './colormap.js';

// Number of mesh lines drawn in each direction, regardless of resolution.
const MESH_LINES = 24;
// Samples along each slice curve; finer than the surface grid.
const SLICE_SAMPLES = 800;
// Slices are keyed by the axis held fixed: 'y' is the plane y = y0 with curve
// x -> f(x, y0); 'x' is the plane x = x0 with curve y -> f(x0, y).
const SLICE_AXES = ['x', 'y'];
// Segments of the unit circle drawn in the tangent plane.
const CIRCLE_SEGMENTS = 128;
// Geodesics are integrated in steps of span / GEODESIC_RESOLUTION, for at most
// GEODESIC_STEPS steps each way (so up to 4 spans long in each direction).
const GEODESIC_RESOLUTION = 400;
const GEODESIC_STEPS = 1600;
// How close (in CSS px) a click must be to the unit circle to pick a direction.
const CIRCLE_PICK_PX = 10;

/**
 * Owns the three.js scene. Math coordinates (x, y, z = f(x, y)) are mapped to
 * world coordinates by toWorld(): the domain is centered at the origin and,
 * with fitZ, z is rescaled so tall/flat surfaces stay viewable. World +Z is up.
 */
export class SurfacePlot {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    this.camera.up.set(0, 0, 1);

    // Registered before OrbitControls' own listener, so a press on the tangent
    // plane's unit circle can switch the controls off before they start an orbit.
    // onDirectionGrab(theta, event) lets main.js run the drag; it re-enables the controls.
    this.onDirectionGrab = null;
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      const theta = this.pickDirection(e.clientX, e.clientY);
      if (theta == null || !this.onDirectionGrab) return;
      this.controls.enabled = false;
      this.onDirectionGrab(theta, e);
    });
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, -4, 6);
    this.scene.add(sun);

    this.content = new THREE.Group();
    this.scene.add(this.content);
    // Each slice has its own group, kept apart from content so moving a slice
    // doesn't rebuild the surface, and a marker for the point hovered in its 2D chart.
    this.slices = {};
    for (const axis of SLICE_AXES) {
      const group = new THREE.Group();
      const marker = makeDot(1, 0xffffff);
      marker.visible = false;
      this.scene.add(group, marker);
      // value: the fixed coordinate, or null when hidden.
      // data: { axis, value, tMin, tMax, ts, zs, zMin, zMax } while visible, else null.
      this.slices[axis] = { value: null, data: null, group, marker };
    }
    // Tangent plane at a clicked point. point: { x, y } or null; direction: angle
    // on the unit circle (from tangentBasis) of the geodesic's initial velocity, or null.
    // data: { x, y, z, fx, fy, velocity } while shown, else null; velocity is the
    // geodesic's unit initial velocity { x, y, z }, or null.
    // frame: { ring, plane, axes } while shown, else null: the unit circle's points
    // and the tangent plane in world space, for picking, and the 3D unit vectors at
    // θ = 0 and θ = π/2 in math space. The geodesic and its initial vector live in
    // their own group, so turning the vector doesn't rebuild the plane.
    this.tangent = { point: null, direction: null, data: null, frame: null, group: new THREE.Group(), geodesic: new THREE.Group() };
    this.scene.add(this.tangent.group, this.tangent.geodesic);

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.6,
      metalness: 0.0,
      polygonOffset: true, // keeps mesh lines from z-fighting with the surface
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    // Screen space covered by overlays on the left (panel) and right (charts);
    // on wide screens the view is centered in, and framed to fit, what's between.
    this.insets = { left: 0, right: 0 };

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hasFramed = false;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  /**
   * sliceColors: { x, y } CSS colors of the two slices; tangent: color of the
   * tangent plane and its unit circle; geodesic: color of the geodesic;
   * tangentVector: color of its initial unit velocity.
   */
  setTheme({ background, frame, text, sliceColors, tangent, geodesic, tangentVector }) {
    this.scene.background = new THREE.Color(background);
    this.theme = { frame, text, sliceColors, tangent, geodesic, tangentVector };
    if (this.last) this.plot(this.last.f, this.last.options);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    const { left, right } = this.activeInsets();
    const shift = (left - right) / 2;
    if (shift) this.camera.setViewOffset(w, h, -shift, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /** Updates the overlay insets (in CSS px) and recenters the view between them. */
  setInsets(insets) {
    this.insets = { ...this.insets, ...insets };
    this.resize();
  }

  activeInsets() {
    return this.container.clientWidth > 600 ? this.insets : { left: 0, right: 0 };
  }

  /**
   * options: { xMin, xMax, yMin, yMax, resolution, fitZ, meshLines }
   * Returns the sample stats so the UI can report the z range.
   */
  plot(f, options) {
    this.last = { f, options };
    const { xMin, xMax, yMin, yMax, fitZ, meshLines } = options;
    const sample = sampleSurface(f, options);
    const { z, n } = sample;
    const finite = Number.isFinite(sample.zMin);
    const zMin = finite ? sample.zMin : 0;
    const zMax = finite ? sample.zMax : 0;

    const span = Math.max(xMax - xMin, yMax - yMin);
    const zSpan = zMax - zMin;
    const zScale = fitZ && zSpan > 0 ? (0.7 * span) / zSpan : 1;
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const cz = (zMin + zMax) / 2;
    this.toWorld = (x, y, zv) => new THREE.Vector3(x - cx, y - cy, (zv - cz) * zScale);
    this.fromWorld = (p) => ({ x: p.x + cx, y: p.y + cy, z: p.z / zScale + cz });
    this.zScale = zScale;

    this.clear();
    this.view = { f, options, zMin, zMax };

    // Surface
    const count = (n + 1) * (n + 1);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const rgb = [0, 0, 0];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const k = j * (n + 1) + i;
        const zv = Number.isNaN(z[k]) ? cz : z[k];
        const p = this.toWorld(xMin + ((xMax - xMin) * i) / n, yMin + ((yMax - yMin) * j) / n, zv);
        positions.set([p.x, p.y, p.z], k * 3);
        viridis(zSpan > 0 ? (zv - zMin) / zSpan : 0.5, rgb);
        colors.set(rgb, k * 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(gridIndices(z, n));
    geometry.computeVertexNormals();
    this.surface = new THREE.Mesh(geometry, this.material);
    this.content.add(this.surface);

    if (meshLines) this.content.add(this.buildMeshLines(positions, z, n));
    this.content.add(...this.buildFrame(options, zMin, zMax));

    for (const axis of SLICE_AXES) this.renderSlice(axis);
    this.renderTangent();

    if (!this.hasFramed) {
      this.resetView();
      this.hasFramed = true;
    }
    return { zMin: sample.zMin, zMax: sample.zMax, finite };
  }

  // Polylines along constant x and constant y, broken wherever samples are NaN.
  buildMeshLines(positions, z, n) {
    const step = Math.max(1, Math.round(n / MESH_LINES));
    const verts = [];
    const segment = (a, b) => {
      if (Number.isNaN(z[a]) || Number.isNaN(z[b])) return;
      verts.push(...positions.subarray(a * 3, a * 3 + 3), ...positions.subarray(b * 3, b * 3 + 3));
    };
    for (let j = 0; j <= n; j += step) {
      for (let i = 0; i < n; i++) segment(j * (n + 1) + i, j * (n + 1) + i + 1);
    }
    for (let i = 0; i <= n; i += step) {
      for (let j = 0; j < n; j++) segment(j * (n + 1) + i, (j + 1) * (n + 1) + i);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
    );
  }

  // Bounding box around the plotted region with min/max tick labels and axis names.
  buildFrame({ xMin, xMax, yMin, yMax }, zMin, zMax) {
    const frameColor = this.theme?.frame ?? '#888888';
    const lo = this.toWorld(xMin, yMin, zMin);
    const hi = this.toWorld(xMax, yMax, zMax);
    const box = new THREE.Box3(lo, hi);
    if (box.max.z - box.min.z < 1e-6) box.expandByVector(new THREE.Vector3(0, 0, 0.01));
    const frame = new THREE.Box3Helper(box, new THREE.Color(frameColor));

    const size = Math.max(hi.x - lo.x, hi.y - lo.y) * 0.045;
    const pad = size * 1.6;
    const label = (text, x, y, zv, scale = 1) => {
      const s = makeLabel(text, this.theme?.text ?? '#cccccc', size * scale);
      s.position.copy(this.toWorld(x, y, zv));
      return s;
    };
    const xm = (xMin + xMax) / 2;
    const ym = (yMin + yMax) / 2;
    const zm = (zMin + zMax) / 2;
    const out = [
      frame,
      label(fmt(xMin), xMin, yMin - pad, zMin),
      label(fmt(xMax), xMax, yMin - pad, zMin),
      label('x', xm, yMin - pad, zMin, 1.3),
      label(fmt(yMin), xMax + pad, yMin, zMin),
      label(fmt(yMax), xMax + pad, yMax, zMin),
      label('y', xMax + pad, ym, zMin, 1.3),
      label(fmt(zMin), xMin - pad, yMax, zMin),
      label(fmt(zMax), xMin - pad, yMax, zMax),
      label('z', xMin - pad, yMax, zm, 1.3),
    ];
    if (zMax === zMin) out.splice(-2, 1); // one z label is enough for a flat surface
    return out;
  }

  /** Shows the slice through the plane axis = value ('x' or 'y'), or hides it when value is null. */
  setSlice(axis, value) {
    this.slices[axis].value = value;
    this.renderSlice(axis);
  }

  // Translucent plane through the frame at the fixed coordinate, plus the slice curve drawn in it.
  renderSlice(axis) {
    const slice = this.slices[axis];
    disposeChildren(slice.group);
    slice.data = null;
    slice.marker.visible = false;
    if (slice.value == null || !this.view) return;
    const { f, options, zMin, zMax } = this.view;
    const v = slice.value;
    // t runs along the free axis; point(t, z) maps a curve point to world space.
    const [tMin, tMax] = axis === 'y' ? [options.xMin, options.xMax] : [options.yMin, options.yMax];
    const point = axis === 'y' ? (t, z) => this.toWorld(t, v, z) : (t, z) => this.toWorld(v, t, z);
    const g = axis === 'y' ? (t) => f(t, v) : (t) => f(v, t);
    const along = axis === 'y' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color(this.theme?.sliceColors?.[axis] ?? '#e0245e');

    const lo = point(tMin, zMin);
    const hi = point(tMax, zMax);
    const width = hi.clone().sub(lo).dot(along);
    const height = Math.max(hi.z - lo.z, width * 0.02);
    // PlaneGeometry lies in XY; tip it up into XZ, then for an x-slice turn it into YZ.
    const planeGeometry = new THREE.PlaneGeometry(width, height).rotateX(Math.PI / 2);
    if (axis === 'x') planeGeometry.rotateZ(Math.PI / 2);
    const center = lo.clone().add(hi).multiplyScalar(0.5);
    planeGeometry.translate(center.x, center.y, center.z);
    const plane = new THREE.Mesh(
      planeGeometry,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
    );
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(planeGeometry),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }),
    );
    slice.group.add(plane, outline);

    const sample = sampleSlice(g, tMin, tMax, SLICE_SAMPLES);
    slice.data = { axis, value: v, tMin, tMax, ...sample };
    slice.marker.material.color.copy(color);
    slice.marker.scale.setScalar(width * 0.012);

    // NaN samples become gaps, so the curve breaks where f is undefined.
    const verts = segmentsOf(Array.from(sample.zs, (z, i) => (Number.isNaN(z) ? null : point(sample.ts[i], z))));
    if (verts.length) slice.group.add(...seeThroughLines(verts, color, 3));

    const size = width * 0.045;
    const label = makeLabel(`${axis} = ${+v.toPrecision(4)}`, `#${color.getHexString()}`, size);
    label.position.copy(point(tMax, zMax)).addScaledVector(along, size * 2.5);
    slice.group.add(label);
  }

  /** Puts the marker on the given slice's curve at free coordinate t, or hides it when t is null. */
  setSliceMarker(axis, t, z) {
    const { data, marker } = this.slices[axis];
    marker.visible = t != null && data != null;
    if (!marker.visible) return;
    marker.position.copy(axis === 'y' ? this.toWorld(t, data.value, z) : this.toWorld(data.value, t, z));
  }

  /**
   * Shows the tangent plane to the surface at (x, y, f(x, y)), or hides it when
   * point is null, and clears any geodesic. Returns tangent.data: null if f has
   * no tangent plane there.
   */
  setTangent(point) {
    this.tangent.point = point;
    this.tangent.direction = null;
    this.renderTangent();
    return this.tangent.data;
  }

  /** Draws the geodesic whose initial velocity is the unit-circle point at angle theta. */
  setGeodesic(theta) {
    this.tangent.direction = theta;
    this.renderGeodesic();
    return this.tangent.data;
  }

  // A square patch of the plane z = z0 + fx (x - x0) + fy (y - y0) around the
  // point, clipped to the domain, with an outline, a dot at the point and the
  // unit circle of tangent vectors; then the geodesic, if a direction is set.
  renderTangent() {
    const tangent = this.tangent;
    disposeChildren(tangent.group);
    tangent.data = null;
    tangent.frame = null;
    this.renderTangentContents();
    this.renderGeodesic();
  }

  renderTangentContents() {
    const tangent = this.tangent;
    if (!tangent.point || !this.view) return;
    const { f, options } = this.view;
    const { xMin, xMax, yMin, yMax } = options;
    const { x, y } = tangent.point;
    if (x < xMin || x > xMax || y < yMin || y > yMax) return;
    const d = partials(f, x, y);
    if (!d) return;
    const { z, fx, fy } = d;
    tangent.data = { x, y, z, fx, fy, velocity: null };

    // Shrink the patch on steep planes so it doesn't tower over the plot.
    const span = Math.max(xMax - xMin, yMax - yMin);
    const rise = (Math.abs(fx) + Math.abs(fy)) * this.zScale;
    const r = Math.max(0.02 * span, Math.min(0.15 * span, (0.4 * span) / (rise || Infinity)));
    const x0 = Math.max(xMin, x - r);
    const x1 = Math.min(xMax, x + r);
    const y0 = Math.max(yMin, y - r);
    const y1 = Math.min(yMax, y + r);
    const plane = (px, py) => this.toWorld(px, py, z + fx * (px - x) + fy * (py - y));
    const corners = [plane(x0, y0), plane(x1, y0), plane(x1, y1), plane(x0, y1)];

    const color = new THREE.Color(this.theme?.tangent ?? '#3355dd');
    const geometry = new THREE.BufferGeometry().setFromPoints(corners);
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const patch = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    );
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(corners),
      new THREE.LineBasicMaterial({ color }),
    );
    tangent.group.add(patch, outline, makeDot(span * 0.012, color, this.toWorld(x, y, z)));

    // Unit circle: (x, y, z) + cos θ e1 + sin θ e2, with e1, e2 orthonormal in 3D.
    // It's a circle in math units, so with fitZ it shows as an ellipse.
    const axes = tangentBasis(fx, fy).map(({ dx, dy }) => ({ x: dx, y: dy, z: fx * dx + fy * dy }));
    const ring = [];
    for (let i = 0; i <= CIRCLE_SEGMENTS; i++) ring.push(this.tangentTip(unitVector(axes, (2 * Math.PI * i) / CIRCLE_SEGMENTS)));
    tangent.group.add(...seeThroughLines(segmentsOf(ring), color, 2));
    const worldPlane = new THREE.Plane().setFromCoplanarPoints(this.toWorld(x, y, z), ...axes.map((a) => this.tangentTip(a)));
    tangent.frame = { ring, plane: worldPlane, axes };
  }

  // World position of the tangent vector v (math units) attached at the tangent point.
  tangentTip(v) {
    const { x, y, z } = this.tangent.data;
    return this.toWorld(x + v.x, y + v.y, z + v.z);
  }

  // The unit vector at the current direction, and the geodesic it starts, traced both ways.
  renderGeodesic() {
    const tangent = this.tangent;
    disposeChildren(tangent.geodesic);
    if (!tangent.frame) return;
    tangent.data.velocity = null;
    if (tangent.direction == null) return;
    const { f, options } = this.view;
    const { xMin, xMax, yMin, yMax } = options;
    const { x, y, z } = tangent.data;
    const span = Math.max(xMax - xMin, yMax - yMin);
    const v = unitVector(tangent.frame.axes, tangent.direction);
    tangent.data.velocity = v;
    const opts = { xMin, xMax, yMin, yMax, step: span / GEODESIC_RESOLUTION, maxSteps: GEODESIC_STEPS };
    const forward = geodesic(f, x, y, v.x, v.y, opts);
    const backward = geodesic(f, x, y, -v.x, -v.y, opts);
    const path = [...backward.reverse(), ...forward.slice(1)].map((p) => this.toWorld(p.x, p.y, p.z));
    const geoColor = new THREE.Color(this.theme?.geodesic ?? '#1d1d1f');
    if (path.length > 1) tangent.geodesic.add(...seeThroughLines(segmentsOf(path), geoColor, 3));
    const vectorColor = new THREE.Color(this.theme?.tangentVector ?? '#d11a1a');
    const arrow = new LineSegments2(
      new LineSegmentsGeometry().setPositions(segmentsOf([this.toWorld(x, y, z), this.tangentTip(v)])),
      new LineMaterial({ color: vectorColor, linewidth: 4, depthTest: false }),
    );
    arrow.renderOrder = 3;
    tangent.geodesic.add(arrow, makeDot(span * 0.01, vectorColor, this.tangentTip(v)));
  }

  /**
   * Returns the angle θ on the unit circle of the tangent plane point under the
   * given client coordinates, or null if there is no tangent plane or the view
   * ray misses it. Unlike pickDirection, the pointer needn't be near the circle.
   */
  directionAt(clientX, clientY) {
    const { frame, data } = this.tangent;
    if (!frame) return null;
    this.setPointer(clientX, clientY);
    const hit = this.raycaster.ray.intersectPlane(frame.plane, new THREE.Vector3());
    if (!hit) return null;
    const p = this.fromWorld(hit);
    const dx = p.x - data.x;
    const dy = p.y - data.y;
    const dz = data.fx * dx + data.fy * dy;
    const [a, b] = frame.axes;
    return Math.atan2(b.x * dx + b.y * dy + b.z * dz, a.x * dx + a.y * dy + a.z * dz);
  }

  /**
   * Returns the angle θ of the point on the tangent plane's unit circle nearest
   * the given client coordinates, or null if none is within CIRCLE_PICK_PX.
   */
  pickDirection(clientX, clientY) {
    const frame = this.tangent.frame;
    if (!frame) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const screen = frame.ring.map((p) => this.toScreen(p, rect));
    let best = null;
    let bestDist = CIRCLE_PICK_PX;
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const a = screen[i];
      const b = screen[i + 1];
      if (!a || !b) continue;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len2 = ex * ex + ey * ey;
      const t = len2 ? Math.min(1, Math.max(0, ((clientX - a.x) * ex + (clientY - a.y) * ey) / len2)) : 0;
      const dist = Math.hypot(clientX - a.x - t * ex, clientY - a.y - t * ey);
      if (dist < bestDist) {
        bestDist = dist;
        best = (2 * Math.PI * (i + t)) / CIRCLE_SEGMENTS;
      }
    }
    return best;
  }

  clear() {
    disposeChildren(this.content, this.material);
    this.surface = null;
  }

  resetView() {
    const box = new THREE.Box3().setFromObject(this.content);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = sphere.radius || 1;
    // Fit the sphere in both the vertical fov and the horizontal space between the insets.
    const { clientWidth: w, clientHeight: h } = this.container;
    const { left, right } = this.activeInsets();
    const halfV = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const halfH = Math.atan((Math.tan(halfV) * Math.max(w - left - right, 100)) / (h || 1));
    const dist = r / Math.sin(Math.min(halfV, halfH));
    const dir = new THREE.Vector3(1.1, -1.6, 1.0).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.near = dist / 100;
    this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(sphere.center);
    this.controls.update();
  }

  /** Returns {x, y, z} on the surface under the given client coordinates, or null. */
  pick(clientX, clientY) {
    if (!this.surface) return null;
    this.setPointer(clientX, clientY);
    const hit = this.raycaster.intersectObject(this.surface)[0];
    return hit ? this.fromWorld(hit.point) : null;
  }

  // Aims the raycaster through the given client coordinates. toScreen is the
  // inverse: client coordinates of a world point, or null if it's behind the camera.
  setPointer(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  toScreen(p, rect = this.renderer.domElement.getBoundingClientRect()) {
    const s = p.clone().project(this.camera);
    return s.z > 1 ? null : { x: rect.left + ((s.x + 1) / 2) * rect.width, y: rect.top + ((1 - s.y) / 2) * rect.height };
  }
}

// Removes and disposes every child of group, except the shared material `keep`.
function disposeChildren(group, keep) {
  for (const obj of [...group.children]) {
    group.remove(obj);
    obj.geometry?.dispose();
    if (obj.material && obj.material !== keep) {
      obj.material.map?.dispose();
      obj.material.dispose();
    }
  }
}

// Flat [x, y, z, ...] segment list for a polyline of Vector3 points; a null
// point leaves a gap.
function segmentsOf(points) {
  const verts = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  return verts;
}

// cos θ · axes[0] + sin θ · axes[1].
function unitVector([a, b], theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: c * a.x + s * b.x, y: c * a.y + s * b.y, z: c * a.z + s * b.z };
}

// A dot drawn on top of everything, e.g. to mark a point on the surface.
function makeDot(radius, color, position) {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshBasicMaterial({ color, depthTest: false }),
  );
  dot.renderOrder = 3;
  if (position) dot.position.copy(position);
  return dot;
}

// A fat line drawn twice: faintly on top of everything so parts behind the
// surface stay visible, then solid with depth testing for the unobstructed parts.
function seeThroughLines(verts, color, linewidth) {
  const hidden = new LineSegments2(
    new LineSegmentsGeometry().setPositions(verts),
    new LineMaterial({ color, linewidth: linewidth - 1, transparent: true, opacity: 0.35, depthTest: false }),
  );
  hidden.renderOrder = 1;
  const solid = new LineSegments2(hidden.geometry, new LineMaterial({ color, linewidth }));
  solid.renderOrder = 2;
  return [hidden, solid];
}

function makeLabel(text, color, height) {
  const fontPx = 64;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `500 ${fontPx}px system-ui, sans-serif`;
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
  canvas.height = fontPx + 16;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
  return sprite;
}
