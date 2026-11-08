import { describe, expect, it } from 'vitest';
import { deviation, largestDelta } from './epsilonDeltaMath.js';

const square = (x) => x * x;

describe('deviation', () => {
  it('finds the largest distance from f(x₀) over the window', () => {
    const { max, at } = deviation(square, 1, 0.1);
    expect(max).toBeCloseTo(0.21, 10); // at x → 1.1
    expect(at).toBeCloseTo(1.1, 10);
    expect(deviation(square, 1, 0).max).toBe(0);
  });

  it('sees a jump right at x₀', () => {
    const step = (x) => (x < 1 ? 0 : 1);
    expect(deviation(step, 1, 1e-6).max).toBe(1);
  });

  it('skips points outside the domain', () => {
    const root = (x) => (x < 0 ? NaN : Math.sqrt(x));
    const d = deviation(root, 0, 0.25);
    expect(d.max).toBeCloseTo(0.5, 6);
    expect(d.skipped).toBeGreaterThan(0);
    expect(deviation(root, -1, 0.5).max).toBeNaN();
  });
});

describe('largestDelta', () => {
  it('stops at the nearer side where f leaves the band', () => {
    // x² at 1 with ε = 0.21: right side 1.1, left side 1 − √0.79 ≈ 0.111.
    const r = largestDelta(square, 1, 0.21, 2);
    expect(r.delta).toBeCloseTo(0.1, 10);
    expect(r.at).toBeCloseTo(1.1, 10);
  });

  it('gives ε² for √x at 0 (only x ≥ 0 counts)', () => {
    const root = (x) => (x < 0 ? NaN : Math.sqrt(x));
    expect(largestDelta(root, 0, 0.3, 1).delta).toBeCloseTo(0.09, 10);
  });

  it('is about 0 where f jumps by ε or more', () => {
    const step = (x) => (x < 1 ? x : x + 1);
    expect(largestDelta(step, 1, 0.5, 1).delta).toBeLessThan(1e-12);
    // A jump smaller than ε doesn't stop δ there.
    expect(largestDelta(step, 1, 1.5, 2).delta).toBeCloseTo(0.5, 10);
  });

  it('returns maxDelta when the band is never left, and reports an undefined f(x₀)', () => {
    expect(largestDelta(Math.sin, 0, 2, 5)).toEqual({ delta: 5, at: null });
    expect(largestDelta(() => NaN, 0, 1, 1)).toEqual({ undefinedAt: true });
  });

  it('handles x·sin(1/x), continuous at 0 with δ ≥ ε', () => {
    const f = (x) => (x === 0 ? 0 : x * Math.sin(1 / x));
    const { delta } = largestDelta(f, 0, 0.1, 1);
    expect(delta).toBeGreaterThanOrEqual(0.1); // |x sin(1/x)| ≤ |x|
    expect(delta).toBeLessThan(0.13); // x sin(1/x) = x at x = 2/(5π) ≈ 0.127
  });
});
