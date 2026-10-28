import { describe, expect, it } from 'vitest';
import { compileFunction } from './expression.js';
import { sampleSurface, sampleSlice, gridIndices, partials, tangentBasis, geodesic } from './surface.js';
import { niceTicks } from './format.js';

describe('compileFunction', () => {
  it('evaluates expressions in x and y', () => {
    const f = compileFunction('x^2 + 2y');
    expect(f(3, 1)).toBe(11);
  });

  it('supports constants and implicit multiplication', () => {
    expect(compileFunction('2pi')(0, 0)).toBeCloseTo(2 * Math.PI);
  });

  it('rejects unknown variables', () => {
    expect(() => compileFunction('x + z')).toThrow(/Unknown variable: z/);
  });

  it('rejects syntax errors and unknown functions', () => {
    expect(() => compileFunction('sin(x')).toThrow(/Syntax error/);
    expect(() => compileFunction('foo(x)')).toThrow();
  });

  it('returns NaN for complex results', () => {
    expect(compileFunction('sqrt(x)')(-1, 0)).toBeNaN();
  });
});

describe('sampleSurface', () => {
  const domain = { xMin: -1, xMax: 1, yMin: -1, yMax: 1, resolution: 2 };

  it('samples a (n+1)^2 grid, row-major in y', () => {
    const { z, zMin, zMax } = sampleSurface((x, y) => x + 10 * y, domain);
    expect(Array.from(z)).toEqual([-11, -10, -9, -1, 0, 1, 9, 10, 11]);
    expect([zMin, zMax]).toEqual([-11, 11]);
  });

  it('stores non-finite values and thrown errors as NaN and ignores them in the range', () => {
    const { z, zMin, zMax } = sampleSurface((x, y) => {
      if (x === 1) throw new Error('boom');
      return x === 0 && y === 0 ? 1 / 0 : x;
    }, domain);
    expect(Number.isNaN(z[4])).toBe(true);
    expect(Number.isNaN(z[2])).toBe(true);
    expect([zMin, zMax]).toEqual([-1, 0]);
  });
});

describe('gridIndices', () => {
  it('emits two triangles per cell', () => {
    expect(gridIndices(new Float64Array(9), 2)).toHaveLength(4 * 2 * 3);
  });

  it('drops triangles touching NaN samples', () => {
    const z = new Float64Array(9);
    z[4] = NaN; // center vertex; only the two off-diagonal corner triangles avoid it
    expect(gridIndices(z, 2)).toEqual([1, 2, 5, 3, 7, 6]);
  });
});

describe('sampleSlice', () => {
  it('samples g(t) and skips non-finite values in the range', () => {
    const { ts, zs, zMin, zMax } = sampleSlice((t) => (t === 0 ? NaN : 3 * t), -1, 1, 2);
    expect(Array.from(ts)).toEqual([-1, 0, 1]);
    expect(zs[0]).toBe(-3);
    expect(Number.isNaN(zs[1])).toBe(true);
    expect([zMin, zMax]).toEqual([-3, 3]);
  });
});

describe('partials', () => {
  it('approximates the gradient by central differences', () => {
    const { fx, fy } = partials((x, y) => x * x * y + Math.sin(y), 2, 1);
    expect(fx).toBeCloseTo(4, 6);
    expect(fy).toBeCloseTo(4 + Math.cos(1), 6);
  });

  it('falls back to a one-sided difference at the edge of the domain', () => {
    const { fx } = partials((x) => (x < 0 ? NaN : 3 * x), 0, 0);
    expect(fx).toBeCloseTo(3, 6);
  });

  it('returns null where f is undefined', () => {
    expect(partials(() => NaN, 0, 0)).toBeNull();
    expect(partials((x) => Math.sqrt(-x * x), 0, 0)).toBeNull();
  });
});

describe('tangentBasis', () => {
  it('is orthonormal in the surface metric', () => {
    const fx = 1.5;
    const fy = -0.7;
    const lift = ({ dx, dy }) => [dx, dy, fx * dx + fy * dy];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const [e1, e2] = tangentBasis(fx, fy).map(lift);
    expect(dot(e1, e1)).toBeCloseTo(1, 12);
    expect(dot(e2, e2)).toBeCloseTo(1, 12);
    expect(dot(e1, e2)).toBeCloseTo(0, 12);
    expect(e1[1]).toBe(0);
  });
});

describe('geodesic', () => {
  const box = { xMin: -3, xMax: 3, yMin: -3, yMax: 3, step: 0.01, maxSteps: 1000 };

  it('is a straight line on a plane', () => {
    const points = geodesic((x, y) => 2 * x + y, 0, 0, 0.3, 0.4, box);
    const last = points.at(-1);
    expect(last.x * 0.4 - last.y * 0.3).toBeCloseTo(0, 6);
    expect(last.x).toBeGreaterThan(1);
  });

  it('follows a great circle on a sphere', () => {
    const f = (x, y) => Math.sqrt(4 - x * x - y * y);
    const v = Math.hypot(1, 0.5); // at the top the metric is Euclidean, so this is the 3D speed
    const points = geodesic(f, 0, 0, 1 / v, 0.5 / v, { ...box, maxSteps: 150 });
    expect(points).toHaveLength(151);
    // The great circle through the top in direction (1, 0.5) lies in the plane x = 2y.
    for (const p of points) expect(p.x - 2 * p.y).toBeCloseTo(0, 6);
    // Unit-speed parametrization at step 0.01: the arc length is 1.5, i.e. the
    // angle from the top on the radius-2 sphere is 0.75.
    expect(points.at(-1).z).toBeCloseTo(2 * Math.cos(0.75), 3);
  });

  it('stops at the edge of the domain', () => {
    const points = geodesic(() => 0, 2.9, 0, 1, 0, box);
    expect(points).toHaveLength(11);
  });
});

describe('niceTicks', () => {
  it('uses 1/2/5 steps and covers the range', () => {
    expect(niceTicks(-6.54, 8.1, 4)).toEqual({ ticks: [-10, -5, 0, 5, 10], min: -10, max: 10 });
    expect(niceTicks(0, 1, 5).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it('pads a degenerate range', () => {
    const { min, max } = niceTicks(2, 2);
    expect(min).toBeLessThan(2);
    expect(max).toBeGreaterThan(2);
  });
});
