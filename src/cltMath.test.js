import { describe, expect, it } from 'vitest';
import { seededRandom, DISTRIBUTIONS, sampleMeans, meanAndSd, binEdges, histogram, normalPdf, normalCdf, distanceToNormal } from './cltMath.js';

describe('seededRandom', () => {
  it('repeats for a seed and differs between seeds', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const c = seededRandom(43);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(c()).not.toBe(first[0]);
    // A fixed value, so a change of generator (which would change every shared picture) is noticed.
    expect(seededRandom(1)()).toBeCloseTo(0.6270739405881613, 15);
  });

  it('is roughly uniform on [0, 1)', () => {
    const r = seededRandom(7);
    const xs = Array.from({ length: 20000 }, r);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const { mean, sd } = meanAndSd(xs);
    expect(mean).toBeCloseTo(0.5, 2);
    expect(sd).toBeCloseTo(Math.sqrt(1 / 12), 2);
  });
});

describe('distributions and sample means', () => {
  for (const [key, dist] of Object.entries(DISTRIBUTIONS)) {
    it(`${key}: draws match the stated mean and variance`, () => {
      const xs = sampleMeans(dist, 1, 40000, seededRandom(3));
      const { mean, sd } = meanAndSd(xs);
      expect(mean).toBeCloseTo(dist.mean, 1);
      expect(sd ** 2).toBeCloseTo(dist.variance, 1);
    });
  }

  it('means of n draws have spread σ/√n', () => {
    const dist = DISTRIBUTIONS.exponential;
    const { mean, sd } = meanAndSd(sampleMeans(dist, 25, 20000, seededRandom(5)));
    expect(mean).toBeCloseTo(1, 2);
    expect(sd).toBeCloseTo(1 / 5, 2);
  });
});

describe('histogram', () => {
  it('counts every value in range once', () => {
    const { edges } = binEdges(DISTRIBUTIONS.uniform, 1, 0, 1, 10);
    const counts = histogram([0, 0.05, 0.5, 0.99, 1.5, -1], edges);
    expect(counts.reduce((s, c) => s + c, 0)).toBe(4);
    expect(counts[0]).toBe(2);
  });

  it('centres bins on the lattice of a discrete mean', () => {
    // Means of 4 dice lie on 1, 1.25, …, 6: bins of width 0.25 centred there.
    const { edges } = binEdges(DISTRIBUTIONS.die, 4, 1, 6, 40);
    expect(edges[1] - edges[0]).toBeCloseTo(0.25, 12);
    expect(edges[0]).toBeCloseTo(0.875, 12);
    const counts = histogram([1, 1.25, 1.25, 6], edges);
    expect(counts.slice(0, 2)).toEqual([1, 2]);
    expect(counts.reduce((s, c) => s + c, 0)).toBe(4);
  });
});

describe('normal curve', () => {
  it('has the right density and distribution function', () => {
    expect(normalPdf(0, 0, 1)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 12);
    expect(normalPdf(3, 1, 2)).toBeCloseTo(normalPdf(1, 0, 1) / 2, 12);
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1)).toBeCloseTo(0.158655, 5);
  });

  it('measures how far a sample is from it', () => {
    const r = seededRandom(9);
    // Approximately normal: sums of 12 uniforms minus 6.
    const near = Array.from({ length: 5000 }, () => {
      let s = -6;
      for (let k = 0; k < 12; k++) s += r();
      return s;
    });
    expect(distanceToNormal(near, 0, 1)).toBeLessThan(0.03);
    expect(distanceToNormal([0, 0, 0, 0], 0, 1)).toBeCloseTo(0.5, 7);
  });
});
