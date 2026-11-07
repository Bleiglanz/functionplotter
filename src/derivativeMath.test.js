import { describe, expect, it } from 'vitest';
import { differenceQuotient, oneSidedLimit, derivativeAt } from './derivativeMath.js';

const square = (x) => x * x;

describe('differenceQuotient', () => {
  it('is the secant slope', () => {
    expect(differenceQuotient(square, 1, 1)).toBe(3); // (4 − 1)/1
    expect(differenceQuotient(square, 1, -0.5)).toBe(1.5); // (0.25 − 1)/(−0.5)
  });

  it('is NaN for h = 0 or where f is undefined', () => {
    expect(differenceQuotient(square, 1, 0)).toBeNaN();
    expect(differenceQuotient(Math.sqrt, 0, -0.1)).toBeNaN();
  });
});

describe('derivativeAt', () => {
  it('matches closed forms for smooth functions', () => {
    expect(derivativeAt(square, 1).value).toBeCloseTo(2, 8);
    expect(derivativeAt(Math.sin, 0).value).toBeCloseTo(1, 8);
    expect(derivativeAt(Math.exp, 0).value).toBeCloseTo(1, 8);
    expect(derivativeAt((x) => x ** 3 - 3 * x, 1).value).toBeCloseTo(0, 8);
    expect(derivativeAt(square, 0).value).toBeCloseTo(0, 8);
  });

  it('is exact for a line', () => {
    expect(derivativeAt((x) => 3 * x - 2, 5, 4).value).toBeCloseTo(3, 10);
  });

  it('works on a wide view', () => {
    expect(derivativeAt(Math.sin, 1, 20).value).toBeCloseTo(Math.cos(1), 7);
  });

  it('reports a corner by its two one-sided slopes', () => {
    const { left, right, value } = derivativeAt(Math.abs, 0);
    expect(left).toEqual({ kind: 'finite', value: -1 });
    expect(right).toEqual({ kind: 'finite', value: 1 });
    expect(value).toBeNaN();
  });

  it('reports vertical tangents', () => {
    const sqrt = derivativeAt(Math.sqrt, 0);
    expect(sqrt.right).toEqual({ kind: 'infinite', sign: 1 });
    expect(sqrt.left).toEqual({ kind: 'undefined' });
    expect(derivativeAt(Math.cbrt, 0).left).toEqual({ kind: 'infinite', sign: 1 });
  });

  it('reports a quotient without a limit', () => {
    const wiggle = (x) => (x === 0 ? 0 : x * Math.sin(1 / x));
    const { left, right } = derivativeAt(wiggle, 0);
    expect(right.kind).toBe('none');
    expect(left.kind).toBe('none');
  });
});

describe('oneSidedLimit', () => {
  it('extrapolates to the one-sided slope', () => {
    const r = oneSidedLimit(square, 2, 1);
    expect(r.kind).toBe('finite');
    expect(r.value).toBeCloseTo(4, 9);
  });
});
