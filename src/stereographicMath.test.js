import { describe, expect, it } from 'vitest';
import { fromLatLon, toLatLon, project, unproject, parallelRadius, latitudeOfRadius, normalizeLatLon } from './stereographicMath.js';

const close = (a, b, digits = 12) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe('fromLatLon and toLatLon', () => {
  it('place the poles and the equator', () => {
    close(fromLatLon(90, 0), [0, 0, 1]);
    close(fromLatLon(-90, 0), [0, 0, -1]);
    close(fromLatLon(0, 90), [0, 1, 0]);
  });

  it('give points on the unit sphere, and round-trip', () => {
    const P = fromLatLon(30, -120);
    expect(Math.hypot(...P)).toBeCloseTo(1, 14);
    const { lat, lon } = toLatLon(P);
    expect(lat).toBeCloseTo(30, 10);
    expect(lon).toBeCloseTo(-120, 10);
  });

  it('report longitude 0 at the poles and 180 rather than −180', () => {
    expect(toLatLon([0, 0, 1]).lon).toBe(0);
    expect(toLatLon([-1, -0, 0]).lon).toBe(180);
  });
});

describe('project', () => {
  it('sends the south pole to 0 and the equator to the unit circle', () => {
    close(project([0, 0, -1]), [0, 0]);
    close(project([1, 0, 0]), [1, 0]);
    close(project([0, -1, 0]), [0, -1]);
  });

  it('puts z on the line from N through P', () => {
    const P = fromLatLon(20, 35);
    const [x, y] = project(P);
    // N + t (P − N) reaches Z = 0 at t = 1/(1 − Z); it must be (x, y, 0).
    const t = 1 / (1 - P[2]);
    close([t * P[0], t * P[1]], [x, y]);
  });

  it('has no image for the north pole', () => {
    expect(project([0, 0, 1])).toBeNull();
  });

  it('is undone by unproject', () => {
    for (const [x, y] of [[0, 0], [0.3, -0.4], [2, 5], [-100, 1]]) {
      close(project(unproject(x, y)), [x, y], 9);
      expect(Math.hypot(...unproject(x, y))).toBeCloseTo(1, 14);
    }
  });

  it('sends the southern hemisphere inside the unit circle and the northern outside', () => {
    expect(Math.hypot(...project(fromLatLon(-10, 70)))).toBeLessThan(1);
    expect(Math.hypot(...project(fromLatLon(10, 70)))).toBeGreaterThan(1);
  });
});

describe('parallelRadius and latitudeOfRadius', () => {
  it('match the projection of a point on the parallel', () => {
    for (const lat of [-80, -30, 0, 45, 89]) {
      expect(parallelRadius(lat)).toBeCloseTo(Math.hypot(...project(fromLatLon(lat, 17))), 9);
      expect(latitudeOfRadius(parallelRadius(lat))).toBeCloseTo(lat, 9);
    }
  });

  it('are 0 at the south pole and ∞ at the north pole', () => {
    expect(parallelRadius(-90)).toBeCloseTo(0, 14);
    expect(parallelRadius(90)).toBe(Infinity);
    expect(latitudeOfRadius(Infinity)).toBe(90);
  });
});

describe('normalizeLatLon', () => {
  it('clamps the latitude and wraps the longitude', () => {
    expect(normalizeLatLon(100, 190)).toEqual({ lat: 90, lon: -170 });
    expect(normalizeLatLon(-95, -180)).toEqual({ lat: -90, lon: 180 });
    expect(normalizeLatLon(10, 540)).toEqual({ lat: 10, lon: 180 });
    expect(normalizeLatLon(10, -45)).toEqual({ lat: 10, lon: -45 });
  });
});
