/**
 * Shared transform helpers for OroCRM JSON:API records.
 */
import type { JsonApiRecord } from '../client'

/** Extract a scalar attribute as a string, or undefined. */
export function strAttr(record: JsonApiRecord, key: string): string | undefined {
  const v = record.attributes?.[key]
  return v != null ? String(v) : undefined
}

/**
 * Extract the single related-record ID from a JSON:API relationship object.
 *
 * OroCRM exposes relationships like:
 *   "relationships": { "owner": { "data": { "type": "users", "id": "5" } } }
 *
 * For to-many relationships the `data` array's first element id is returned.
 */
export function relId(record: JsonApiRecord, relName: string): string | undefined {
  const rel = record.relationships?.[relName]?.data
  if (!rel) return undefined
  if (Array.isArray(rel)) return rel[0]?.id
  return (rel as { id: string }).id
}
