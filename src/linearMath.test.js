import { describe, expect, it } from 'vitest';
import { apply, det, trace, inverse, towards, eigen, angleBetween, classify } from './linearMath.js';

const close = (actual, expected, digits = 12) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], digits));

describe('basics', () => {
  it('applies, takes determinants, traces and inverses', () => {
    const A = [2, 1, 1, 3];
    expect(apply(A, [1, 0])).toEqual([2, 1]); // the first column
    expect(apply(A, [0, 1])).toEqual([1, 3]);
    expect(det(A)).toBe(5);
    expect(trace(A)).toBe(5);
    const inv = inverse(A);
    close(apply(inv, apply(A, [0.3, -1.7])), [0.3, -1.7]);
    expect(inverse([1, 2, 2, 4])).toBeNull();
  });

  it('moves from the identity to A', () => {
    expect(towards([2, 1, 1, 3], 0)).toEqual([1, 0, 0, 1]);
    expect(towards([2, 1, 1, 3], 1)).toEqual([2, 1, 1, 3]);
    expect(towards([3, 0, 0, 3], 0.5)).toEqual([2, 0, 0, 2]);
  });
});

describe('eigen', () => {
  const check = (A, { values, vectors }) => {
    vectors.forEach((v, i) => close(apply(A, v), v.map((x) => x * values[i])));
  };

  it('finds two real directions', () => {
    const A = [2, 1, 1, 2];
    const e = eigen(A);
    expect(e.kind).toBe('distinct');
    close(e.values, [3, 1]);
    check(A, e);
    close(e.vectors[0], [Math.SQRT1_2, Math.SQRT1_2]);
  });

  it('handles negative and zero eigenvalues', () => {
    const A = [0, 1, 1, 0]; // reflection in y = x: λ = 1, −1
    const e = eigen(A);
    close(e.values, [1, -1]);
    check(A, e);
    const P = [1, 0, 0, 0]; // projection
    const p = eigen(P);
    close(p.values, [1, 0]);
    check(P, p);
  });

  it('reports complex eigenvalues for a rotation', () => {
    const r = Math.PI / 6;
    const e = eigen([Math.cos(r), -Math.sin(r), Math.sin(r), Math.cos(r)]);
    expect(e.kind).toBe('complex');
    expect(e.re).toBeCloseTo(Math.cos(r), 12);
    expect(e.im).toBeCloseTo(Math.sin(r), 12);
  });

  it('tells a multiple of I from a shear', () => {
    expect(eigen([2, 0, 0, 2])).toEqual({ kind: 'scalar', values: [2, 2] });
    const s = eigen([1, 1, 0, 1]);
    expect(s.kind).toBe('defective');
    close(s.values, [1, 1]);
    close(s.vectors[0], [1, 0]);
  });
});

describe('angleBetween', () => {
  it('measures the signed angle from v to w', () => {
    expect(angleBetween([1, 0], [0, 2])).toBeCloseTo(90, 12);
    expect(angleBetween([1, 0], [0, -1])).toBeCloseTo(-90, 12);
    expect(angleBetween([1, 0], [-3, 0])).toBe(180);
    expect(angleBetween([1, 1], [2, 2])).toBeCloseTo(0, 12);
  });
});

describe('classify', () => {
  it('names the common maps', () => {
    expect(classify([1, 0, 0, 1])).toEqual({ kind: 'identity' });
    expect(classify([2, 0, 0, 2])).toEqual({ kind: 'scaling', factor: 2 });
    expect(classify([2, 0, 0, 0.5])).toEqual({ kind: 'stretch', factors: [2, 0.5] });
    expect(classify([1, 0.5, 0, 1])).toEqual({ kind: 'shear', axis: 'x', amount: 0.5 });
    expect(classify([1, 2, 2, 4])).toEqual({ kind: 'singular' });
    const rot = classify([0, -2, 2, 0]);
    expect(rot.kind).toBe('rotation');
    expect(rot.angle).toBeCloseTo(90, 12);
    expect(rot.scale).toBeCloseTo(2, 12);
    const ref = classify([0, 1, 1, 0]);
    expect(ref.kind).toBe('reflection');
    expect(ref.axis).toBeCloseTo(45, 12);
    expect(classify([2, 1, 1, 3])).toEqual({ kind: 'general' });
  });
});
