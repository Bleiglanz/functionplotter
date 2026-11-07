import { describe, expect, it } from 'vitest';
import { parse } from 'mathjs';
import { taylorCoefficients, smoothOrders, taylorValue, isNegligible, fitInterval } from './taylorMath.js';

const coeffs = (src, x0, N = 10) => taylorCoefficients(parse(src), x0, N);
const factorial = (k) => (k <= 1 ? 1 : k * factorial(k - 1));

function expectClose(actual, expected, digits = 12) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((v, k) => expect(v, `coefficient ${k}`).toBeCloseTo(expected[k], digits));
}

describe('taylorCoefficients', () => {
  it('matches the classic series at 0', () => {
    const N = 12;
    const range = Array.from({ length: N + 1 }, (_, k) => k);
    expectClose(coeffs('exp(x)', 0, N), range.map((k) => 1 / factorial(k)));
    expectClose(coeffs('e^x', 0, N), range.map((k) => 1 / factorial(k)));
    expectClose(coeffs('sin(x)', 0, N), range.map((k) => (k % 2 ? (-1) ** ((k - 1) / 2) / factorial(k) : 0)));
    expectClose(coeffs('cos(x)', 0, N), range.map((k) => (k % 2 ? 0 : (-1) ** (k / 2) / factorial(k))));
    expectClose(coeffs('1/(1+x^2)', 0, N), range.map((k) => (k % 2 ? 0 : (-1) ** (k / 2))));
    expectClose(coeffs('log(1+x)', 0, N), range.map((k) => (k === 0 ? 0 : (-1) ** (k + 1) / k)));
    expectClose(coeffs('atan(x)', 0, N), range.map((k) => (k % 2 ? (-1) ** ((k - 1) / 2) / k : 0)));
  });

  it('matches tan, sqrt and asin', () => {
    expectClose(coeffs('tan(x)', 0, 7), [0, 1, 0, 1 / 3, 0, 2 / 15, 0, 17 / 315]);
    // √(1 + x): binomial coefficients C(1/2, k).
    expectClose(coeffs('sqrt(1 + x)', 0, 4), [1, 1 / 2, -1 / 8, 1 / 16, -5 / 128]);
    expectClose(coeffs('asin(x)', 0, 5), [0, 1, 0, 1 / 6, 0, 3 / 40]);
  });

  it('expands around other points', () => {
    // log x at 1: (x−1) − (x−1)²/2 + …
    expectClose(coeffs('log(x)', 1, 4), [0, 1, -1 / 2, 1 / 3, -1 / 4]);
    // eˣ at 2: e²/k!
    expectClose(coeffs('exp(x)', 2, 5), [0, 1, 2, 3, 4, 5].map((k) => Math.exp(2) / factorial(k)));
    // f⁽ᵏ⁾ of sin at 1 cycle through sin, cos, −sin, −cos.
    const s = Math.sin(1);
    const c = Math.cos(1);
    expectClose(coeffs('sin(x)', 1, 4), [s, c, -s / 2, -c / 6, s / 24]);
  });

  it('reproduces a polynomial exactly, in powers of x − x₀', () => {
    // x³ − 3x at 1 = −2 + 0·t + 3t² + t³
    expect(coeffs('x^3 - 3x', 1, 6)).toEqual([-2, 0, 3, 1, 0, 0, 0]);
    expect(coeffs('(x - 2)^5', 2, 6)).toEqual([0, 0, 0, 0, 0, 1, 0]);
  });

  it('handles removable zeros in a quotient', () => {
    // sin(x)/x at 0 = 1 − x²/6 + x⁴/120 − …
    expectClose(coeffs('sin(x)/x', 0, 6).slice(0, 5), [1, 0, -1 / 6, 0, 1 / 120]);
  });

  it('marks orders where the derivative does not exist', () => {
    expect(smoothOrders(coeffs('sqrt(x)', 0))).toBe(1); // only f(0)
    expect(smoothOrders(coeffs('abs(x)', 0))).toBe(1);
    expect(smoothOrders(coeffs('abs(x^3)', 0))).toBe(3); // |x|³ is twice differentiable
    expect(smoothOrders(coeffs('sqrt(x^2)', 0))).toBe(1); // that's |x|
    expect(smoothOrders(coeffs('x^2.5', 0))).toBe(1); // undefined for x < 0
    expect(smoothOrders(coeffs('(x^2)^1.25', 0))).toBe(3); // |x|^2.5: f, f′, f″ exist
    expect(smoothOrders(coeffs('log(x)', 0))).toBe(0);
    expect(smoothOrders(coeffs('1/x', 0))).toBe(0);
    expect(coeffs('sqrt(x^4)', 0, 6).slice(0, 3)).toEqual([0, 0, 1]); // x², smooth
  });

  it('treats subtrees without x as constants', () => {
    expectClose(coeffs('pi * x + sin(pi/2)', 0, 2), [1, Math.PI, 0]);
  });

  it('names constructs it has no rule for', () => {
    expect(() => coeffs('x > 0 ? x : 0', 1)).toThrow(/a \? b : c/);
    expect(() => coeffs('floor(x)', 1.5)).toThrow(/floor/);
  });
});

describe('taylorValue', () => {
  it('evaluates Tₙ by Horner', () => {
    const a = coeffs('exp(x)', 0, 20);
    expect(taylorValue(a, 0, 20, 1)).toBeCloseTo(Math.E, 12);
    expect(taylorValue(a, 0, 1, 0.5)).toBe(1.5);
    expect(taylorValue([1, 2, 3], 1, 2, 3)).toBe(1 + 2 * 2 + 3 * 4);
  });
});

describe('isNegligible', () => {
  it('compares a term with the largest one at the given distance', () => {
    expect(isNegligible([1, 1e-20, 1], 1, 1)).toBe(true);
    expect(isNegligible([1, 1e-3, 1], 1, 1)).toBe(false);
    expect(isNegligible([0, 0, 0], 2, 1)).toBe(true);
  });
});

describe('fitInterval', () => {
  it('grows from x₀ while the error is small', () => {
    const xs = [0, 1, 2, 3, 4, 5];
    const fs = [9, 1, 0, 0.5, 2, 0];
    const ts = [0, 0, 0, 0, 0, 0];
    expect(fitInterval(xs, fs, ts, 2.2, 1)).toEqual({ lo: 2, hi: 3, loEdge: false, hiEdge: false });
    expect(fitInterval(xs, fs, ts, 0, 1)).toBeNull();
    expect(fitInterval(xs, fs, fs, 2, 1)).toEqual({ lo: 0, hi: 5, loEdge: true, hiEdge: true });
  });

  it('steps over a single undefined sample, but not over a gap', () => {
    const xs = [0, 1, 2, 3, 4];
    const ts = [0, 0, 0, 0, 0];
    expect(fitInterval(xs, [0, 0, NaN, 0, 0], ts, 2, 1)).toEqual({ lo: 0, hi: 4, loEdge: true, hiEdge: true });
    expect(fitInterval(xs, [0, NaN, NaN, 0, 0], ts, 3, 1)).toEqual({ lo: 3, hi: 4, loEdge: false, hiEdge: true });
  });
});
