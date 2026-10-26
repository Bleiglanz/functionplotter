import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { sampleSurface, sampleSlice, gridIndices } from './surface.js';
import { formatNumber as fmt } from './format.js';
import { viridis } from './colormap.js';

// Number of mesh lines drawn in each direction, regardless of resolution.
const MESH_LINES = 24;
// Samples along each slice curve; finer than the surface grid.
const SLICE_SAMPLES = 800;
// Slices are keyed by the axis held fixed: 'y' is the plane y = y0 with curve
// x -> f(x, y0); 'x' is the plane x = x0 with curve y -> f(x0, y).
const SLICE_AXES = ['x', 'y'];

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
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({ depthTest: false }),
      );
      marker.renderOrder = 3;
      marker.visible = false;
      this.scene.add(group, marker);
      // value: the fixed coordinate, or null when hidden.
      // data: { axis, value, tMin, tMax, ts, zs, zMin, zMax } while visible, else null.
      this.slices[axis] = { value: null, data: null, group, marker };
    }

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

  /** sliceColors: { x, y } CSS colors of the two slices. */
  setTheme({ background, frame, text, sliceColors }) {
    this.scene.background = new THREE.Color(background);
    this.theme = { frame, text, sliceColors };
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

    // Segments only between consecutive finite samples, so the curve breaks where f is undefined.
    const verts = [];
    let prev = null;
    for (let i = 0; i <= SLICE_SAMPLES; i++) {
      const z = sample.zs[i];
      const p = Number.isNaN(z) ? null : point(sample.ts[i], z);
      if (p && prev) verts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
    }
    if (verts.length) {
      // Drawn twice: faintly on top of everything so parts behind the surface stay
      // visible, then solid with depth testing for the unobstructed parts.
      const hidden = new LineSegments2(
        new LineSegmentsGeometry().setPositions(verts),
        new LineMaterial({ color, linewidth: 2, transparent: true, opacity: 0.35, depthTest: false }),
      );
      hidden.renderOrder = 1;
      const curve = new LineSegments2(hidden.geometry, new LineMaterial({ color, linewidth: 3 }));
      curve.renderOrder = 2;
      slice.group.add(hidden, curve);
    }

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
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.surface)[0];
    return hit ? this.fromWorld(hit.point) : null;
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
