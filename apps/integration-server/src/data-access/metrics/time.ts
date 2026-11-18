/**
 * Day ranges and time buckets. Everything here is UTC days as `YYYY-MM-DD`
 * strings — the same day arithmetic the store's range filter uses (the first
 * ten characters of the stored ISO text).
 */
import { GRANULARITY_PARAMS } from '@opensteward/shared'
import { HttpError } from '../scope'
import type { Granularity, GranularityParam } from './types'

export const DEFAULT_RANGE_DAYS = 30
export const MAX_RANGE_DAYS = 366
/** `auto` granularity: up to this many days is `day`, … */
export const AUTO_DAY_MAX_DAYS = 62
/** … up to this many `week`, beyond it `month`. */
export const AUTO_WEEK_MAX_DAYS = 182
export const DAY_MS = 86_400_000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export interface MetricRange {
  from: string
  to: string
  /** Every day in the range, inclusive, `YYYY-MM-DD`. */
  days: string[]
}

export function dayString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function shiftDay(day: string, days: number): string {
  return dayString(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
}

function parseDay(raw: string, name: string): number {
  if (!DAY_RE.test(raw)) {
    throw new HttpError(400, 'INVALID_RANGE', `\`${name}\` must be a date, YYYY-MM-DD.`)
  }
  const ms = Date.parse(`${raw}T00:00:00Z`)
  if (Number.isNaN(ms) || dayString(ms) !== raw) {
    throw new HttpError(400, 'INVALID_RANGE', `\`${name}\` is not a real date.`)
  }
  return ms
}

function daysBetween(fromMs: number, toMs: number): string[] {
  const days: string[] = []
  for (let ms = fromMs; ms <= toMs; ms += DAY_MS) days.push(dayString(ms))
  return days
}

/**
 * The inclusive day range a metric covers: `to` defaults to today (UTC),
 * `from` to `DEFAULT_RANGE_DAYS` days ending on `to`. At most
 * `MAX_RANGE_DAYS` days.
 */
export function parseRange(
  from: string | undefined,
  to: string | undefined,
  now: Date,
): MetricRange {
  const toMs = to ? parseDay(to, 'to') : parseDay(dayString(now.getTime()), 'to')
  const fromMs = from ? parseDay(from, 'from') : toMs - (DEFAULT_RANGE_DAYS - 1) * DAY_MS
  if (fromMs > toMs) throw new HttpError(400, 'INVALID_RANGE', '`from` is after `to`.')
  const span = Math.round((toMs - fromMs) / DAY_MS) + 1
  if (span > MAX_RANGE_DAYS) {
    throw new HttpError(400, 'INVALID_RANGE', `A range covers at most ${MAX_RANGE_DAYS} days.`)
  }
  return { from: dayString(fromMs), to: dayString(toMs), days: daysBetween(fromMs, toMs) }
}

/** A range of `days` days ending on `to`. */
export function rangeEnding(to: string, days: number): MetricRange {
  const toMs = Date.parse(`${to}T00:00:00Z`)
  const fromMs = toMs - (days - 1) * DAY_MS
  return { from: dayString(fromMs), to, days: daysBetween(fromMs, toMs) }
}

/** The equal-length range immediately before `range` (for `compare=1`). */
export function previousRange(range: MetricRange): MetricRange {
  return rangeEnding(shiftDay(range.from, -1), range.days.length)
}

export function isGranularityParam(v: unknown): v is GranularityParam {
  return typeof v === 'string' && (GRANULARITY_PARAMS as readonly string[]).includes(v)
}

/** `auto`: ≤ 62 days → day, ≤ 182 → week, otherwise month. */
export function resolveGranularity(
  param: GranularityParam | undefined,
  range: MetricRange,
): Granularity {
  if (param && param !== 'auto') return param
  const n = range.days.length
  if (n <= AUTO_DAY_MAX_DAYS) return 'day'
  if (n <= AUTO_WEEK_MAX_DAYS) return 'week'
  return 'month'
}

/** ISO 8601 week of a day, `YYYY-Www` (the week-year may differ from the calendar year). */
export function isoWeek(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`)
  const dow = (new Date(ms).getUTCDay() + 6) % 7 // Monday = 0
  const thursday = new Date(ms + (3 - dow) * DAY_MS)
  const year = thursday.getUTCFullYear()
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** The bucket a day falls in. */
export function bucketOf(day: string, g: Granularity): string {
  if (g === 'day') return day
  if (g === 'month') return day.slice(0, 7)
  return isoWeek(day)
}

/** Every bucket touching the range, in order (partial first / last weeks and months included). */
export function bucketsFor(range: MetricRange, g: Granularity): string[] {
  const out: string[] = []
  for (const d of range.days) {
    const b = bucketOf(d, g)
    if (out[out.length - 1] !== b) out.push(b)
  }
  return out
}

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

/**
 * Epoch ms of a stored ISO date or datetime, or null. A datetime with no
 * offset is read as UTC — `Date.parse` would read it in the host's zone —
 * matching the store, which buckets and compares such values as UTC. A bare
 * calendar date is UTC midnight (as `Date.parse` already reads it).
 */
export function parseInstant(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const ms = Date.parse(LOCAL_DATETIME.test(raw) ? `${raw.replace(' ', 'T')}Z` : raw)
  return Number.isNaN(ms) ? null : ms
}

/** Months (`YYYY-MM`) touching the range, in order. */
export function monthsFor(range: MetricRange): string[] {
  return bucketsFor(range, 'month')
}
