/** Short display form: plain decimals for ordinary magnitudes, exponent form for tiny/huge ones. */
export function formatNumber(v, digits = 4) {
  if (v === 0) return '0';
  return Math.abs(v) >= 1e4 || Math.abs(v) < 1e-3 ? v.toExponential(digits - 1) : String(+v.toPrecision(digits));
}

/**
 * About `count` evenly spaced "nice" tick values (steps of 1, 2 or 5 × 10^k)
 * covering [min, max]. Returns the ticks plus the expanded domain they span.
 */
export function niceTicks(min, max, count = 5) {
  if (!(max > min)) {
    const pad = Math.abs(min) * 0.1 || 1;
    return niceTicks(min - pad, max + pad, count);
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  // Each tick from its index, not by repeated addition, and snapped to 0 when
  // rounding leaves something like -5.55e-17 there.
  for (let i = 0; lo + i * step <= hi + step / 2; i++) {
    const t = lo + i * step;
    ticks.push(Math.abs(t) < step * 1e-9 ? 0 : +t.toPrecision(12));
  }
  return { ticks, min: lo, max: hi };
}
