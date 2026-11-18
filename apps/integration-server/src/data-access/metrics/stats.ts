/**
 * Distribution and concentration arithmetic, computed in TypeScript over
 * values the store returned. Pure functions, pinned by hand-computed tests.
 */
import type { MetricStats } from './types'

/** Round to `digits` decimals, killing float noise (`0.1 + 0.2`). */
export function round(x: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round(x * f) / f
}

/**
 * Percentile of SORTED values by linear interpolation between closest ranks
 * (the "R-7" / Excel PERCENTILE.INC / numpy default definition):
 * h = (n − 1)·p, result = x[⌊h⌋] + (h − ⌊h⌋)·(x[⌊h⌋+1] − x[⌊h⌋]).
 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN
  const h = (sorted.length - 1) * p
  const lo = Math.floor(h)
  const hi = Math.min(lo + 1, sorted.length - 1)
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!)
}

/** n, min, quartiles, p90, max and mean of a non-empty value list (rounded to 2 decimals). */
export function summarize(group: string, values: readonly number[]): MetricStats {
  const s = [...values].sort((a, b) => a - b)
  const mean = s.reduce((a, b) => a + b, 0) / s.length
  return {
    group,
    n: s.length,
    min: round(s[0]!),
    p25: round(percentile(s, 0.25)),
    p50: round(percentile(s, 0.5)),
    p75: round(percentile(s, 0.75)),
    p90: round(percentile(s, 0.9)),
    max: round(s[s.length - 1]!),
    mean: round(mean),
  }
}

/** Index of the histogram band a value falls in: `< e0` → 0, [e(i−1), e(i)) → i, `≥ last` → n. */
export function bandIndex(value: number, edges: readonly number[]): number {
  for (let i = 0; i < edges.length; i++) if (value < edges[i]!) return i
  return edges.length
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round(n, 4))
}

/** Labels of `bandIndex` bands: `< 10`, `10–50`, `≥ 50` (with an optional unit suffix). */
export function bandLabels(edges: readonly number[], suffix = ''): string[] {
  const s = suffix ? ` ${suffix}` : ''
  const out = [`< ${fmt(edges[0]!)}${s}`]
  for (let i = 1; i < edges.length; i++) out.push(`${fmt(edges[i - 1]!)}–${fmt(edges[i]!)}${s}`)
  out.push(`≥ ${fmt(edges[edges.length - 1]!)}${s}`)
  return out
}

/** Labels of the store's `age` bands for a set of whole-day edges. */
export function agingLabels(direction: 'past' | 'future', edges: readonly number[]): string[] {
  const first =
    edges[0] === 0 ? (direction === 'past' ? 'Current' : 'Today or past') : `0–${edges[0]} days`
  const out = [first]
  for (let i = 1; i < edges.length; i++) out.push(`${edges[i - 1]! + 1}–${edges[i]} days`)
  out.push(`${edges[edges.length - 1]! + 1}+ days`)
  return out
}

export interface ConcentrationStats {
  total: number
  groups: number
  /** Share (0–100) of the top k groups, per requested k. */
  topShares: Array<{ k: number; share: number | null }>
  /** Herfindahl–Hirschman index on the 0–10 000 scale (Σ of squared percentage shares). */
  hhi: number | null
  /** 1 / Σ s² — the number of equal-sized groups with the same concentration. */
  effectiveN: number | null
  /** Groups by value, largest first, with share and cumulative share (0–100). */
  ranked: Array<{ key: string; value: number; share: number; cumulative: number }>
}

/** Concentration of non-negative values across groups (ties broken by key, for stability). */
export function concentration(
  values: ReadonlyMap<string, number>,
  topN: readonly number[],
): ConcentrationStats {
  const entries = [...values.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const total = entries.reduce((n, [, v]) => n + v, 0)
  if (total <= 0) {
    return {
      total: 0,
      groups: 0,
      topShares: topN.map((k) => ({ k, share: null })),
      hhi: null,
      effectiveN: null,
      ranked: [],
    }
  }
  let cum = 0
  let sumSq = 0
  const ranked = entries.map(([key, value]) => {
    const s = value / total
    sumSq += s * s
    cum += value
    return { key, value, share: round(s * 100, 2), cumulative: round((cum / total) * 100, 2) }
  })
  return {
    total,
    groups: entries.length,
    topShares: topN.map((k) => ({
      k,
      share: round((entries.slice(0, k).reduce((n, [, v]) => n + v, 0) / total) * 100, 2),
    })),
    hhi: round(sumSq * 10_000, 0),
    effectiveN: round(1 / sumSq, 2),
    ranked,
  }
}
