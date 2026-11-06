import { describe, expect, it } from 'vitest';
import { value, slope, scale, yIntercept, shift, zero, factorTwoDistance, tangentFoot } from './exponentialMath.js';

const TOL = 12; // digits, i.e. about 1e-12

describe('exponentialMath', () => {
  const unit = { a: 1, b: 1, c: 0, d: 0 };

  it('evaluates e^x', () => {
    expect(value(unit, 0)).toBe(1);
    expect(slope(unit, 0)).toBe(1);
    expect(scale(unit)).toBe(1);
    expect(yIntercept(unit)).toBe(1);
    expect(tangentFoot(unit, 0)).toBe(-1);
    expect(factorTwoDistance(unit)).toBeCloseTo(Math.LN2, TOL);
  });

  it('finds the zero of a shifted, decaying curve', () => {
    const p = { a: -2, b: -0.5, c: 1, d: 3 };
    expect(zero(p)).toBeCloseTo(2 * (1 - Math.log(1.5)), TOL); // (ln(3/2) - 1)/(-1/2)
    expect(value(p, zero(p))).toBeCloseTo(0, TOL);
    expect(yIntercept(p)).toBeCloseTo(-2 * Math.E + 3, TOL);
    expect(shift(p)).toBe(2);
    expect(factorTwoDistance(p)).toBeCloseTo(2 * Math.LN2, TOL); // a half-life here
  });

  it('puts the tangent foot on the asymptote', () => {
    const p = { a: 1.5, b: 0.7, c: -0.3, d: 2 };
    const x = 0.8;
    const foot = tangentFoot(p, x);
    // The tangent at x, evaluated at the foot, is at height d.
    expect(value(p, x) + slope(p, x) * (foot - x)).toBeCloseTo(p.d, TOL);
  });

  it('has no zero when a = 0 or the curve stays on one side', () => {
    expect(zero({ a: 0, b: 1, c: 0, d: -1 })).toBeNull();
    expect(zero({ a: 1, b: 1, c: 0, d: 1 })).toBeNull();
    expect(zero({ a: 1, b: 1, c: 0, d: 0 })).toBeNull();
  });

  it('returns null for what b = 0 leaves undefined', () => {
    const flat = { a: 2, b: 0, c: 1, d: 1 };
    expect(shift(flat)).toBeNull();
    expect(tangentFoot(flat, 3)).toBeNull();
    expect(factorTwoDistance(flat)).toBeNull();
    expect(zero(flat)).toBeNull();
    expect(slope(flat, 5)).toBe(0);
  });
});
