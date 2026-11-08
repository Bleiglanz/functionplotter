import { describe, expect, it } from 'vitest';
import { parseHash, serializeHash, extent, robustExtent } from './pageUtils.js';

// Each page's DEFAULTS, copied literally: the page scripts touch the DOM and
// cannot be imported here. Keep them in step with the source files named.
const PAGES = {
  // src/exponential.js
  exponential: { a: 1, b: 1, c: 0, d: 0, xMin: -4, xMax: 4, yMin: -2, yMax: 8, showRef: true },
  // src/zeta.js
  zeta: { n: 3, xMax: 6, yMax: 5 },
  // src/main.js (expr is PRESETS[0].expr)
  surface: {
    expr: 'sin(sqrt(x^2 + y^2))',
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
    resolution: 120,
    fitZ: true,
    meshLines: true,
    sliceX: false,
    x0: 0,
    sliceY: false,
    y0: 0,
  },
  // src/riemann.js
  riemann: { expr: 'x^2', a: '0', b: '2', n: 8, rule: 'left', band: true },
  // src/ftc.js
  ftc: { expr: 'cos(x)', a: '0', xMin: '-1', xMax: '7', b: 2, n: 8, rule: 'midpoint', rects: false },
  // src/derivative.js
  derivative: { expr: 'x^2', xMin: '-1', xMax: '3', x0: 1, h: 1 },
  // src/taylor.js
  taylor: { expr: 'sin(x)', xMin: '-7', xMax: '7', x0: 0, n: 3 },
  // src/sequences.js
  sequences: { expr: '1 + 2*(-1)^n/n', L: '', eps: 0.25, nMax: 40 },
  // src/epsilon-delta.js
  'epsilon-delta': { expr: 'x^2', xMin: '-0.5', xMax: '2.5', x0: 1, eps: 0.5, delta: 0.5 },
  // src/fourier.js
  fourier: { expr: 'x < 0 ? -1 : 1', a: '-pi', b: 'pi', n: 5 },
  // src/linear-maps.js
  'linear-maps': { a: 1.5, b: 0.5, c: 0.25, d: 1, t: 1 },
  // src/eigenvectors.js
  eigenvectors: { a: 1.5, b: 1, c: 0.5, d: 1, theta: 60 },
  // src/ode.js
  // src/clt.js
  clt: { dist: 'exponential', n: 5, seed: 1, zoom: false },
  // src/complex.js
  complex: { expr: '(z^2 - 1)/(z^2 + 1)', xMin: '-2', xMax: '2', yMin: '-1.5', yMax: '1.5' },
  // src/ode.js
  ode: { expr: 'x - y', xMin: '-3', xMax: '3', yMin: '-3', yMax: '3', starts: '-3,2;-3,-2;-1,-3;0,0', nullcline: false },
};

// Links shared before the conformance work, with the state they must keep opening (U6).
// Every new page adds one.
const FIXTURES = {
  exponential: [
    '#a=-2&b=-0.5&c=1&d=3&xMin=-4&xMax=4&yMin=-2&yMax=8&showRef=1',
    { a: -2, b: -0.5, c: 1, d: 3, xMin: -4, xMax: 4, yMin: -2, yMax: 8, showRef: true },
  ],
  zeta: ['#n=100&xMax=6&yMax=5', { n: 100, xMax: 6, yMax: 5 }],
  surface: [
    '#expr=sin(x)%2Bcos(y)&sliceX=1&sliceY=1',
    { ...PAGES.surface, expr: 'sin(x)+cos(y)', sliceX: true, sliceY: true },
  ],
  riemann: [
    '#expr=x%5E2&a=0&b=2&n=50&rule=left&band=1',
    { expr: 'x^2', a: '0', b: '2', n: 50, rule: 'left', band: true },
  ],
  ftc: [
    '#expr=cos%28x%29&a=0&xMin=-1&xMax=7&b=2&n=8&rule=midpoint&rects=0',
    { expr: 'cos(x)', a: '0', xMin: '-1', xMax: '7', b: 2, n: 8, rule: 'midpoint', rects: false },
  ],
  derivative: [
    '#expr=abs%28x%29&xMin=-2&xMax=2&x0=0&h=-0.25',
    { expr: 'abs(x)', xMin: '-2', xMax: '2', x0: 0, h: -0.25 },
  ],
  taylor: [
    '#expr=log%28x%29&xMin=-0.5&xMax=3.5&x0=1&n=8',
    { expr: 'log(x)', xMin: '-0.5', xMax: '3.5', x0: 1, n: 8 },
  ],
  sequences: [
    '#expr=1%2Fn&L=0.1&eps=0.05&nMax=40',
    { expr: '1/n', L: '0.1', eps: 0.05, nMax: 40 },
  ],
  'epsilon-delta': [
    '#expr=x+%3C+1+%3F+x+%3A+x+%2B+1&xMin=-0.5&xMax=2.5&x0=1&eps=0.5&delta=0.3',
    { expr: 'x < 1 ? x : x + 1', xMin: '-0.5', xMax: '2.5', x0: 1, eps: 0.5, delta: 0.3 },
  ],
  fourier: ['#expr=abs%28x%29&a=-pi&b=pi&n=3', { expr: 'abs(x)', a: '-pi', b: 'pi', n: 3 }],
  'linear-maps': ['#a=0&b=1&c=1&d=0&t=0.5', { a: 0, b: 1, c: 1, d: 0, t: 0.5 }],
  eigenvectors: ['#a=1&b=1&c=0&d=1&theta=45', { a: 1, b: 1, c: 0, d: 1, theta: 45 }],
  clt: ['#dist=die&n=3&seed=12345&zoom=1', { dist: 'die', n: 3, seed: 12345, zoom: true }],
  complex: ['#expr=sqrt%28z%29&xMin=-2&xMax=2&yMin=-1.5&yMax=1.5', { expr: 'sqrt(z)', xMin: '-2', xMax: '2', yMin: '-1.5', yMax: '1.5' }],
  ode: [
    '#expr=y*%281+-+y%29&xMin=-1&xMax=8&yMin=-0.5&yMax=1.6&starts=0%2C0.05%3B0%2C1.5&nullcline=1',
    { expr: 'y*(1 - y)', xMin: '-1', xMax: '8', yMin: '-0.5', yMax: '1.6', starts: '0,0.05;0,1.5', nullcline: true },
  ],
};

describe('parseHash / serializeHash', () => {
  for (const [page, defaults] of Object.entries(PAGES)) {
    it(`round-trips the ${page} defaults`, () => {
      expect(parseHash('#' + serializeHash(defaults), defaults)).toEqual(defaults);
    });

    it(`opens the saved ${page} link the same way`, () => {
      const [hash, expected] = FIXTURES[page];
      expect(parseHash(hash, defaults)).toEqual(expected);
    });
  }

  it('has a fixture for every page', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(Object.keys(PAGES).sort());
  });

  it('keeps how broken values have always been read', () => {
    const d = PAGES.exponential;
    expect(parseHash('#a=abc', d).a).toBe(1); // not a number: default
    expect(parseHash('#xMax=', d).xMax).toBe(0); // empty: +'' is 0
    expect(parseHash('#showRef=abc', d).showRef).toBe(false); // only '1' is true
    expect(parseHash('#zzz=5', d)).toEqual(d); // unknown keys ignored
    expect(parseHash('', d)).toEqual(d);
  });

  it('writes booleans as 1/0 and leaves out the #', () => {
    expect(serializeHash({ n: 3, band: true, rects: false, expr: 'x^2' })).toBe('n=3&band=1&rects=0&expr=x%5E2');
  });
});

describe('extent', () => {
  it('pads the range of the values and extras by 8 %', () => {
    const [lo, hi] = extent([1, 3], 0);
    expect(lo).toBeCloseTo(-0.24, 12);
    expect(hi).toBeCloseTo(3.24, 12);
  });

  it('skips non-finite values', () => {
    expect(extent([NaN, 2, Infinity], 0)[1]).toBeCloseTo(2.16, 12);
  });
});

describe('robustExtent', () => {
  it('ignores a single pole among ordinary values', () => {
    const values = Array.from({ length: 199 }, (_, i) => i / 198);
    values.push(1e9);
    const [lo, hi] = robustExtent(values, 0);
    expect(lo).toBeGreaterThanOrEqual(-1);
    expect(hi).toBeLessThanOrEqual(2);
  });
});
