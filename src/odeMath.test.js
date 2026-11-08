import { describe, expect, it } from 'vitest';
import { rk4Step, traceSolution, zeroCurve, parseStarts, formatStarts } from './odeMath.js';

const box = { xMin: -3, xMax: 3, yMin: -3, yMax: 3 };

describe('rk4Step', () => {
  it('integrates y′ = y with fourth-order accuracy', () => {
    let s = [1];
    for (let i = 0; i < 10; i++) s = rk4Step(([y]) => [y], s, 0.1);
    expect(s[0]).toBeCloseTo(Math.E, 5);
  });

  it('works on systems: a rotation keeps the radius', () => {
    let s = [1, 0];
    for (let i = 0; i < 100; i++) s = rk4Step(([x, y]) => [-y, x], s, 0.0628);
    expect(Math.hypot(...s)).toBeCloseTo(1, 6);
  });
});

describe('traceSolution', () => {
  it('follows y′ = y through (0, 1): y = eˣ', () => {
    const pts = traceSolution((x, y) => y, 0, 1, box);
    expect(pts.length).toBeGreaterThan(100);
    for (let i = 1; i < pts.length; i++) expect(pts[i][0]).toBeGreaterThan(pts[i - 1][0]);
    for (const [x, y] of pts) expect(y).toBeCloseTo(Math.exp(x), 6);
    // It leaves the box at the top (y = 3.3 at most) and runs to the left edge.
    expect(pts.at(-1)[1]).toBeLessThanOrEqual(3.3);
    expect(pts[0][0]).toBeLessThan(-3);
  });

  it('follows y′ = x − y: y = x − 1 + C·e⁻ˣ', () => {
    const pts = traceSolution((x, y) => x - y, 0, 2, box);
    for (const [x, y] of pts) expect(y).toBeCloseTo(x - 1 + 3 * Math.exp(-x), 6);
  });

  it('stops at a vertical tangent (circles of y′ = −x/y)', () => {
    const pts = traceSolution((x, y) => -x / y, 0, 2, box);
    for (const [x, y] of pts) expect(Math.hypot(x, y)).toBeCloseTo(2, 4);
    expect(Math.abs(pts[0][0])).toBeGreaterThan(1.9);
    expect(Math.abs(pts.at(-1)[0])).toBeGreaterThan(1.9);
  });

  it('returns nothing where f is undefined at the start', () => {
    expect(traceSolution(() => NaN, 0, 0, box)).toEqual([]);
  });
});

describe('zeroCurve', () => {
  it('finds the line y = x for f = x − y', () => {
    const segs = zeroCurve((x, y) => x - y, box, 20, 20);
    expect(segs.length).toBeGreaterThan(10);
    for (const [x1, y1, x2, y2] of segs) {
      expect(x1).toBeCloseTo(y1, 9);
      expect(x2).toBeCloseTo(y2, 9);
    }
  });

  it('skips poles: f = 1/y has no zero', () => {
    expect(zeroCurve((x, y) => 1 / (y - 0.05), box, 20, 20)).toEqual([]);
  });
});

describe('parseStarts / formatStarts', () => {
  it('round-trips and skips bad pairs', () => {
    expect(parseStarts('-2,2;0,-1')).toEqual([[-2, 2], [0, -1]]);
    expect(parseStarts('1,x;;3')).toEqual([]);
    expect(parseStarts('')).toEqual([]);
    expect(formatStarts([[1 / 3, -2]])).toBe('0.3333,-2');
  });
});
