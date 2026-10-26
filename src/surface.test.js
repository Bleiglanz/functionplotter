import { describe, expect, it } from 'vitest';
import { compileFunction } from './expression.js';
import { sampleSurface, sampleSlice, gridIndices } from './surface.js';
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
