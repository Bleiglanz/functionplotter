import { describe, expect, it } from 'vitest';
import { compileFunction } from './expression.js';
import { partition, tag, riemannSum, sums, bounds, integrate, antiderivative } from './integral.js';

describe('compileFunction with other variables', () => {
  it('compiles functions of x alone', () => {
    expect(compileFunction('x^2 + 1', ['x'])(3)).toBe(10);
    expect(() => compileFunction('x + y', ['x'])).toThrow(/Unknown variable: y\. Use x\./);
  });

  it('compiles constants', () => {
    expect(compileFunction('pi/2', [])()).toBeCloseTo(Math.PI / 2);
    expect(() => compileFunction('2x', [])).toThrow(/Unknown variable: x/);
    expect(() => compileFunction(' ', [])).toThrow(/Enter a number/);
  });
});

describe('partition', () => {
  it('is equidistant and ends exactly at b', () => {
    expect(partition(0, 1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    const xs = partition(0, 0.3, 3);
    expect(xs[3]).toBe(0.3);
  });
});

describe('tag', () => {
  const f = (x) => x * x;
  it('picks endpoints and midpoints', () => {
    expect(tag(f, 1, 2, 'left')).toEqual({ x: 1, y: 1 });
    expect(tag(f, 1, 2, 'right')).toEqual({ x: 2, y: 4 });
    expect(tag(f, 1, 2, 'midpoint')).toEqual({ x: 1.5, y: 2.25 });
  });

  it('finds an interior minimum and maximum', () => {
    expect(tag(f, -1, 1, 'lower').y).toBe(0);
    expect(tag((x) => -f(x), -1, 1, 'upper').y).toBe(-0);
    expect(tag(f, -1, 2, 'upper')).toEqual({ x: 2, y: 4 });
  });

  it('is NaN where f is undefined', () => {
    expect(tag(Math.sqrt, -1, 1, 'lower').y).toBeNaN();
    expect(tag((x) => 1 / x, 0, 1, 'left').y).toBeNaN();
  });
});

describe('riemannSum', () => {
  const f = (x) => x * x;
  it('computes known sums of x² on [0, 1]', () => {
    // Left: Σ (i/n)²/n for i < n = (n−1)n(2n−1)/(6n³).
    expect(riemannSum(f, 0, 1, 4, 'left').sum).toBeCloseTo(14 / 64);
    expect(riemannSum(f, 0, 1, 4, 'right').sum).toBeCloseTo(30 / 64);
    expect(riemannSum(f, 0, 1, 4, 'lower').sum).toBeCloseTo(14 / 64);
    expect(riemannSum(f, 0, 1, 4, 'upper').sum).toBeCloseTo(30 / 64);
  });

  it('is exact for linear f with midpoints', () => {
    expect(riemannSum((x) => 3 * x + 1, -1, 2, 5, 'midpoint').sum).toBeCloseTo(7.5);
  });

  it('treats a > b as a negative Δx', () => {
    expect(riemannSum(f, 1, 0, 100, 'midpoint').sum).toBeCloseTo(-1 / 3, 4);
  });

  it('matches sums()', () => {
    const all = sums(Math.sin, 0, 3, 20, 'midpoint');
    expect(all).toHaveLength(20);
    expect(all[19]).toBeCloseTo(riemannSum(Math.sin, 0, 3, 20, 'midpoint').sum, 12);
  });

  it('bounds() matches the lower and upper rules', () => {
    const f = (x) => Math.sin(3 * x);
    const { lower, upper } = bounds(f, 0, 2, 12);
    expect(lower).toEqual(sums(f, 0, 2, 12, 'lower'));
    expect(upper).toEqual(sums(f, 0, 2, 12, 'upper'));
  });

  it('converges to the integral, squeezed by lower and upper sums', () => {
    const exact = 1 / 3;
    for (const n of [10, 100]) {
      const lower = riemannSum(f, 0, 1, n, 'lower').sum;
      const upper = riemannSum(f, 0, 1, n, 'upper').sum;
      expect(lower).toBeLessThanOrEqual(exact);
      expect(upper).toBeGreaterThanOrEqual(exact);
      expect(upper - lower).toBeCloseTo(1 / n, 10);
    }
  });
});

describe('integrate', () => {
  it('matches closed forms', () => {
    expect(integrate((x) => x * x, 0, 1)).toBeCloseTo(1 / 3, 10);
    expect(integrate(Math.sin, 0, Math.PI)).toBeCloseTo(2, 10);
    expect(integrate(Math.exp, -1, 2)).toBeCloseTo(Math.exp(2) - Math.exp(-1), 9);
    expect(integrate((x) => Math.sin(x) ** 2, 0, 2 * Math.PI)).toBeCloseTo(Math.PI, 9);
  });

  it('is NaN where f is undefined', () => {
    expect(integrate(Math.sqrt, -1, 1)).toBeNaN();
  });
});

describe('antiderivative', () => {
  it('is ∫ₐˣ f on both sides of a', () => {
    const xs = partition(-2, 3, 50);
    const F = antiderivative((x) => 2 * x, 1, xs);
    xs.forEach((x, i) => expect(F[i]).toBeCloseTo(x * x - 1, 10));
  });

  it('is undefined only beyond a gap in f, away from a', () => {
    const xs = partition(-1, 2, 30);
    const F = antiderivative((x) => (x < 0 ? NaN : 1), 1, xs);
    xs.forEach((x, i) => (x >= 0 ? expect(F[i]).toBeCloseTo(x - 1, 10) : expect(F[i]).toBeNaN()));
  });
});
