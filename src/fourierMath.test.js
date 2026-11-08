import { describe, expect, it } from 'vitest';
import { sampleMidpoints, coefficients, partialSum, amplitude, periodic, largestJump } from './fourierMath.js';

const T = 2 * Math.PI;
const M = 4096;
const coeffs = (f, N = 8) => coefficients(sampleMidpoints(f, -Math.PI, T, M), T, N);
const square = (x) => (x < 0 ? -1 : 1);

describe('coefficients', () => {
  it('match the square wave: bₖ = 4/(πk) for odd k', () => {
    const { a, b } = coeffs(square);
    for (let k = 0; k <= 8; k++) {
      expect(a[k]).toBeCloseTo(0, 10);
      expect(b[k]).toBeCloseTo(k % 2 ? 4 / (Math.PI * k) : 0, 5);
    }
  });

  it('match the sawtooth x and the parabola x²', () => {
    const saw = coeffs((x) => x);
    const par = coeffs((x) => x * x);
    expect(par.a[0]).toBeCloseTo((Math.PI * Math.PI) / 3, 5);
    for (let k = 1; k <= 8; k++) {
      expect(saw.b[k]).toBeCloseTo((2 * (-1) ** (k + 1)) / k, 5);
      expect(par.a[k]).toBeCloseTo((4 * (-1) ** k) / (k * k), 5);
    }
  });

  it('are exact for a trigonometric polynomial', () => {
    const { a, b } = coefficients(sampleMidpoints((x) => 2 + 3 * Math.cos(2 * x) - Math.sin(5 * x), 0, T, 64), T, 6);
    expect(a[0]).toBeCloseTo(2, 12);
    expect(a[2]).toBeCloseTo(3, 12);
    expect(b[5]).toBeCloseTo(-1, 12);
    expect(amplitude({ a, b }, 1)).toBeCloseTo(0, 12);
  });

  it('scale with the period', () => {
    // sin(πx) on [0, 2]: ω = π, so b₁ = 1.
    const { b } = coefficients(sampleMidpoints((x) => Math.sin(Math.PI * x), 0, 2, 256), 2, 3);
    expect(b[1]).toBeCloseTo(1, 12);
  });
});

describe('partialSum', () => {
  it('converges to f where f is smooth, and overshoots at a jump (Gibbs)', () => {
    const c = coeffs(square, 200);
    expect(partialSum(c, T, 200, Math.PI / 2)).toBeCloseTo(1, 2);
    expect(partialSum(c, T, 200, 0)).toBeCloseTo(0, 10); // the midpoint of the jump
    let max = -Infinity;
    for (let x = 0; x < 0.1; x += 1e-4) max = Math.max(max, partialSum(c, T, 199, x));
    expect(max).toBeCloseTo(1.179, 2); // ≈ 9 % of the jump 2 above 1
  });
});

describe('periodic and largestJump', () => {
  it('repeats f with period T', () => {
    const g = periodic((x) => x, -Math.PI, T);
    expect(g(Math.PI + 1)).toBeCloseTo(-Math.PI + 1, 12);
    expect(g(-3 * Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5, 12);
  });

  it('finds the jump of the square wave and the wrap-around jump of the sawtooth', () => {
    const sq = largestJump(sampleMidpoints(square, -Math.PI, T, M), T);
    expect(Math.abs(sq.size)).toBe(2);
    expect(Math.abs(sq.at)).toBeLessThan(1e-12); // at 0 or at ±π
    const saw = largestJump(sampleMidpoints((x) => x, -Math.PI, T, M), T);
    expect(saw.size).toBeCloseTo(-2 * Math.PI, 2);
    expect(largestJump(sampleMidpoints(Math.sin, -Math.PI, T, M), T)).toBeNull();
    expect(largestJump(sampleMidpoints((x) => x * x, -Math.PI, T, M), T)).toBeNull(); // continuous extension
  });
});
