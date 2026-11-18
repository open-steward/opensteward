/**
 * Ozon timestamps → canonical ISO 8601, without guessing a zone.
 *
 * Ozon's spec shows zoned values for posting fields (`in_process_at`,
 * `2024-05-20T09:12:30.123Z`) but zone-less ones for finance operations
 * (`operation_date`, `2024-05-01 00:00:00`) and states no zone for the
 * latter. The shared `toIsoDatetime` reads a zone-less value as UTC; for a
 * Russian marketplace that may well be Moscow time, and the difference would
 * be invisible on a UTC host. So only a value that states its own zone is
 * promoted — anything else stays untouched in `metadata`.
 */
import { toIsoDatetime } from '@opensteward/shared'

const STATES_ITS_ZONE = /T.*(?:Z|[+-]\d{2}:?\d{2})$/i

export function isoIfZoned(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return STATES_ITS_ZONE.test(trimmed) ? toIsoDatetime(trimmed) : undefined
}
