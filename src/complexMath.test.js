import { describe, expect, it } from 'vitest';
import { parse, evaluate, complex } from 'mathjs';
import { compileComplex, domainColor, windingNumber, findZeros, findPoles } from './complexMath.js';

const fn = (src) => compileComplex(parse(src));
const box = { xMin: -2, xMax: 2, yMin: -1.5, yMax: 1.5 };

describe('compileComplex', () => {
  it('agrees with math.js complex evaluation', () => {
    const points = [[0.3, -0.7], [-1.2, 0.4], [2, 1.5], [-0.5, -2]];
    for (const src of ['z^2 + 1', '(z - 1)/(z + i)', 'exp(i z)', 'log(z)', 'sqrt(z)', 'sin(z) cos(z)', 'tan(z)', 'z^(1/3)', '2^z', 'cosh(z) - sinh(z)', 'conj(z) * z', 'abs(z) + arg(z) i']) {
      const f = fn(src);
      for (const [x, y] of points) {
        const expected = complex(evaluate(src, { z: complex(x, y) }));
        const [u, v] = f(x, y);
        expect(u, `${src} at ${x}+${y}i`).toBeCloseTo(expected.re, 10);
        expect(v, `${src} at ${x}+${y}i`).toBeCloseTo(expected.im, 10);
      }
    }
  });

  it('takes integer powers exactly, also at 0', () => {
    expect(fn('z^3')(0, 0)).toEqual([0, 0]);
    expect(fn('z^2')(0, 1)).toEqual([-1, 0]);
    expect(fn('z^-1')(2, 0)[0]).toBe(0.5);
  });

  it('names what it cannot compile', () => {
    expect(() => fn('w + 1')).toThrow(/Unknown variable: w/);
    expect(() => fn('gamma(z)')).toThrow(/gamma/);
    expect(() => fn('z > 1 ? z : 1')).toThrow(/no meaning/);
  });
});

describe('domainColor', () => {
  it('colors by argument and modulus', () => {
    expect(domainColor(0, 0)).toEqual([0, 0, 0]); // 0 is black
    const red = domainColor(1, 0);
    expect(red[0]).toBeGreaterThan(200);
    expect(red[1]).toBeLessThan(60);
    const cyan = domainColor(-1, 0);
    expect(cyan[0]).toBeLessThan(60);
    expect(cyan[2]).toBeGreaterThan(200);
    expect(domainColor(Infinity, 0)).toEqual([255, 255, 255]);
    expect(domainColor(NaN, 0)).toEqual([128, 128, 128]);
    const big = domainColor(1e6, 0);
    expect(big[1]).toBeGreaterThan(200); // nearly white
  });
});

describe('windingNumber, findZeros, findPoles', () => {
  it('counts the order of a zero or pole', () => {
    expect(windingNumber(fn('z^3'), [0, 0], 0.5)).toBe(3);
    expect(windingNumber(fn('1/z^2'), [0, 0], 0.5)).toBe(-2);
    expect(windingNumber(fn('z - 5'), [0, 0], 0.5)).toBe(0);
  });

  it('finds the zeros of z³ − 1 and the poles of 1/(z² + 1)', () => {
    const zeros = findZeros(fn('z^3 - 1'), box);
    expect(zeros).toHaveLength(3);
    for (const { z, order } of zeros) {
      expect(Math.hypot(...z)).toBeCloseTo(1, 9);
      expect(order).toBe(1);
    }
    const poles = findPoles(fn('1/(z^2 + 1)'), box);
    expect(poles.map((p) => p.z[1]).sort()).toEqual([-1, 1]);
    expect(findZeros(fn('1/(z^2 + 1)'), box)).toEqual([]);
  });

  it('reports a double zero once, with order 2', () => {
    const zeros = findZeros(fn('(z - 0.5)^2 (z + 1)'), box);
    const dbl = zeros.find((p) => Math.abs(p.z[0] - 0.5) < 1e-4);
    expect(dbl.order).toBe(2);
    expect(zeros).toHaveLength(2);
  });
});
