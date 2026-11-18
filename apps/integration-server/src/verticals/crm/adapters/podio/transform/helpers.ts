import type { PodioItemField } from '../client'

/**
 * Find a field by external_id and return the first value entry.
 * Returns undefined when field is absent.
 */
export function getFieldEntry(
  fields: PodioItemField[],
  externalId: string,
): Record<string, unknown> | undefined {
  const field = fields.find((f) => f.external_id === externalId)
  return field?.values?.[0] as Record<string, unknown> | undefined
}

/** Get a plain string value for text/email/phone fields. */
export function getFieldValue(
  fields: PodioItemField[],
  externalId: string,
): string | undefined {
  const entry = getFieldEntry(fields, externalId)
  if (!entry) return undefined
  const val = entry['value']
  return val !== undefined ? String(val) : undefined
}

/** Get the text label for a category (dropdown) field. */
export function getCategoryText(
  fields: PodioItemField[],
  externalId: string,
): string | undefined {
  const entry = getFieldEntry(fields, externalId)
  if (!entry) return undefined
  const val = entry['value'] as Record<string, unknown> | undefined
  return val?.['text'] !== undefined ? String(val['text']) : undefined
}

/** Get the item_id for an app-relation field. */
export function getRelationId(
  fields: PodioItemField[],
  externalId: string,
): string | undefined {
  const entry = getFieldEntry(fields, externalId)
  if (!entry) return undefined
  const val = entry['value'] as Record<string, unknown> | undefined
  const itemId = val?.['item_id']
  return itemId !== undefined ? String(itemId) : undefined
}

/** Build a Podio fields payload for create/update. */
export function buildFields(
  pairs: Array<[string, Array<Record<string, unknown>>]>,
): Record<string, Array<Record<string, unknown>>> {
  const out: Record<string, Array<Record<string, unknown>>> = {}
  for (const [k, v] of pairs) {
    if (v.length > 0) out[k] = v
  }
  return out
}
