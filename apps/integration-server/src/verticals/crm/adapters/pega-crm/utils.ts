/**
 * Pega CRM adapter shared utilities.
 *
 * Pre-normalisation helpers for Pega-specific data formats that cannot be
 * handled by the generic @opensteward/shared `toIsoDatetime` utility.
 */

import { toIsoDatetime } from '@opensteward/shared'

/**
 * Pega Platform datetime values in REST API responses use the ISO 8601 basic
 * compact format with a space-separated GMT suffix, e.g.:
 *   '20240115T093000.000 GMT'
 *
 * This differs from extended ISO 8601 (which uses separators: 2024-01-15T09:30:00Z)
 * and is not parseable by the JavaScript Date constructor or `toIsoDatetime`.
 *
 * This helper pre-normalises the compact Pega format to extended ISO 8601
 * before passing through to `toIsoDatetime`, so both formats are handled
 * transparently.
 *
 * Examples:
 *   '20240115T093000.000 GMT'  →  '2024-01-15T09:30:00.000Z'
 *   '2024-01-15T09:30:00Z'    →  '2024-01-15T09:30:00.000Z' (already valid)
 *   undefined                 →  undefined
 */
const PEGA_COMPACT_DATETIME =
  /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?\s+GMT$/

export function parsePegaDatetime(input: unknown): string | undefined {
  if (typeof input !== 'string') return toIsoDatetime(input)
  const trimmed = input.trim()
  const m = trimmed.match(PEGA_COMPACT_DATETIME)
  if (m) {
    // Expand compact basic ISO to extended ISO with Z suffix
    const expanded = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ''}Z`
    return toIsoDatetime(expanded)
  }
  return toIsoDatetime(trimmed)
}
