/**
 * Field readers shared by the Qontak transforms.
 *
 * Qontak's documented examples send ids as numbers (`"id": 1`) on most
 * resources and as strings (`"id": "3"`) on tasks, and blank text as `""`.
 * These readers turn both into the canonical shapes without inventing a
 * value: a missing id throws, blank text is absent.
 */
import { toIsoDatetime } from '@opensteward/shared'

/** A record's own id, as a string. Throws when the record has none. */
export function requireId(value: unknown, resource: string): string {
  if (
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value !== '')
  ) {
    return String(value)
  }
  throw new Error(`Qontak ${resource}: record has no id`)
}

/** A required text field. Throws when absent or blank. */
export function requireText(value: unknown, resource: string, field: string): string {
  if (typeof value === 'string' && value.trim() !== '') return value
  throw new Error(`Qontak ${resource}: record has no \`${field}\``)
}

/** Optional text: absent for null, undefined or blank. */
export function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** Optional foreign key: numbers and non-blank strings become strings. */
export function ref(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return text(value)
}

/** Optional timestamp, normalised to ISO 8601. */
export function iso(value: unknown): string | undefined {
  return toIsoDatetime(value)
}
