/**
 * Date windows for Ada's Data Export API.
 *
 * GET /api/v2/export/conversations needs a date range: `created_since` or
 * `updated_since` "Must be an ISO 8601 UTC timestamp ending with 'Z' (e.g.,
 * `2024-07-01T00:00:00Z`); required for valid API requests", and without an
 * explicit end "only records within 7 days of this timestamp are returned".
 * A range may span at most 60 days, and only the past 12 months are served
 * (https://docs.ada.cx/reference/data-export/overview).
 *
 * The windows run newest first and are anchored to UTC midnight, so the same
 * call on the same UTC day asks for the same windows and page N is stable.
 * The upper bound is the next UTC midnight. The lower bound is the caller's
 * `updatedAfter`, or the documented 12-month lookback, whichever is later.
 */
import { EXPORT_LOOKBACK_MONTHS, EXPORT_MAX_WINDOW_DAYS } from './constants'

const DAY_MS = 86_400_000

export interface ExportWindow {
  since: string
  to: string
}

export interface ExportWindows {
  /** Which pair of parameters the windows go in. */
  mode: 'created' | 'updated'
  /** The upper bound: the next UTC midnight after `now`. */
  anchor: string
  /** The lower bound actually used. */
  lower: string
  windows: ExportWindow[]
}

/** "an ISO 8601 UTC timestamp ending with 'Z' (e.g., `2024-07-01T00:00:00Z`)" */
export function adaTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function exportWindows(now: Date, updatedAfter?: Date): ExportWindows {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const d = now.getUTCDate()
  const end = Date.UTC(y, m, d + 1)
  // The first whole UTC day inside "the past 12 months".
  const lookback = Date.UTC(y, m - EXPORT_LOOKBACK_MONTHS, d + 1)
  const after =
    updatedAfter instanceof Date && !Number.isNaN(updatedAfter.getTime())
      ? updatedAfter.getTime()
      : undefined
  const lower = after !== undefined && after > lookback ? after : lookback
  const span = EXPORT_MAX_WINDOW_DAYS * DAY_MS
  const windows: ExportWindow[] = []
  for (let hi = end; hi > lower; hi -= span) {
    windows.push({ since: adaTimestamp(Math.max(hi - span, lower)), to: adaTimestamp(hi) })
  }
  return {
    mode: after !== undefined ? 'updated' : 'created',
    anchor: adaTimestamp(end),
    lower: adaTimestamp(lower),
    windows,
  }
}
