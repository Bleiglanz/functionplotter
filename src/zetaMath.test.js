import { describe, expect, it } from 'vitest';
import { partialSum, zeta, tailBounds } from './zetaMath.js';

describe('partialSum', () => {
  it('sums 1/k^x', () => {
    expect(partialSum(2, 1)).toBe(1);
    expect(partialSum(2, 3)).toBeCloseTo(1 + 1 / 4 + 1 / 9, 15);
    expect(partialSum(1, 4)).toBeCloseTo(25 / 12, 15); // harmonic number H₄
  });
});

describe('zeta', () => {
  it('matches closed forms', () => {
    expect(zeta(2)).toBeCloseTo(Math.PI ** 2 / 6, 13);
    expect(zeta(4)).toBeCloseTo(Math.PI ** 4 / 90, 13);
    expect(zeta(6)).toBeCloseTo(Math.PI ** 6 / 945, 13);
    expect(zeta(3)).toBeCloseTo(1.2020569031595942, 13); // Apéry's constant
  });

  it('behaves like 1/(x − 1) + γ near the pole and tends to 1', () => {
    const gamma = 0.5772156649015329;
    expect(zeta(1.001) - 1 / 0.001).toBeCloseTo(gamma, 3);
    expect(zeta(40) - 1).toBeCloseTo(2 ** -40, 14); // the k = 2 term dominates
  });

  it('is NaN for x ≤ 1', () => {
    expect(zeta(1)).toBeNaN();
    expect(zeta(0.5)).toBeNaN();
  });

  it('agrees with partial sums plus the tail bounds', () => {
    for (const x of [1.5, 2, 3.7]) {
      for (const n of [1, 10, 100]) {
        const tail = zeta(x) - partialSum(x, n);
        const { lower, upper } = tailBounds(x, n);
        expect(tail).toBeGreaterThan(lower);
        expect(tail).toBeLessThan(upper);
      }
    }
  });
});
