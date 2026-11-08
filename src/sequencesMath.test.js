import { describe, expect, it } from 'vitest';
import { terms, estimateLimit, tailDeviations, firstIndex } from './sequencesMath.js';

describe('estimateLimit', () => {
  it('finds limits of converging sequences', () => {
    expect(estimateLimit((n) => 1 / n).limit).toBe(0);
    expect(estimateLimit((n) => (-1) ** n / n).limit).toBe(0);
    expect(estimateLimit((n) => 1 + (2 * (-1) ** n) / n).limit).toBe(1);
    expect(estimateLimit((n) => (2 * n * n + 1) / (n * n + 5 * n)).limit).toBe(2);
    expect(estimateLimit((n) => 0.9 ** n).limit).toBe(0);
    expect(estimateLimit((n) => Math.sin(n) / n).limit).toBe(0);
  });

  it('cancels slow algebraic errors', () => {
    expect(estimateLimit((n) => (1 + 1 / n) ** n).limit).toBeCloseTo(Math.E, 6);
    expect(estimateLimit((n) => 3 + 1 / Math.sqrt(n)).limit).toBeCloseTo(3, 6);
  });

  it('reports sequences without a limit', () => {
    expect(estimateLimit((n) => (-1) ** n)).toEqual({ none: true });
    expect(estimateLimit((n) => Math.sin(n))).toEqual({ none: true });
    expect(estimateLimit(() => NaN)).toEqual({ none: true });
    expect(estimateLimit((n) => n * n)).toEqual({ infinite: 1 });
    expect(estimateLimit((n) => -(2 ** n))).toEqual({ infinite: -1 });
  });
});

describe('tailDeviations and firstIndex', () => {
  const a = (n) => 1 / n;
  const dev = tailDeviations(terms(a, 1000), 0, a);

  it('gives the largest deviation from n on', () => {
    expect(dev.tail[0]).toBe(1);
    expect(dev.tail[9]).toBeCloseTo(0.1, 15);
    expect(dev.beyond).toBeCloseTo(1 / 2000, 15);
  });

  it('finds N(ε) as the first index whose whole tail is inside the band', () => {
    expect(firstIndex(dev, 0.1)).toEqual({ N: 11 }); // 1/10 is not < 0.1
    expect(firstIndex(dev, 0.25)).toEqual({ N: 5 });
    expect(firstIndex(dev, 2)).toEqual({ N: 1 });
    expect(firstIndex(dev, 1e-4)).toEqual({ never: true }); // probes past 1000 leave the band
    expect(firstIndex(dev, 0.0007)).toEqual({ beyond: true }); // 1/1000 > ε > 1/2000
  });

  it('never finds N for a wrong limit or a jumping sequence', () => {
    const wrong = tailDeviations(terms(a, 100), 0.5, a);
    expect(firstIndex(wrong, 0.4)).toEqual({ never: true });
    expect(firstIndex(wrong, 0.6)).toEqual({ N: 1 });
    const b = (n) => (-1) ** n;
    expect(firstIndex(tailDeviations(terms(b, 100), 0, b), 0.9)).toEqual({ never: true });
  });

  it('works without probes beyond the stored terms', () => {
    const d = tailDeviations([3, 1, 2], 0);
    expect(d.tail).toEqual([3, 2, 2]);
    expect(firstIndex(d, 2.5)).toEqual({ N: 2 });
    expect(firstIndex(d, 1)).toEqual({ beyond: true });
  });
});
