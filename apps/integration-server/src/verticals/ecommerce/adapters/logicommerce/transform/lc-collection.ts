/**
 * LogiCommerce category → canonical Collection.
 *
 * Source: GET /categories and GET /categories/{id}
 * (https://api-sync.logicommerce.cloud/docs/reference.cfm?module=categories&languageId=2).
 * The documented example category carries `"ID" : 1`, `"LANGUAGES": [{
 * "LANGUAGE" :"ES", "LONGDESCRIPTION" :"", "NAME" :"", … }]` and
 * `"PRODUCTS": [{ "ID" : 123, "PID" :"abc" }]`.
 */
import type { Collection } from '../../../schema/collection'
import { requireId, requireName, type RawLanguageEntry } from '../languages'

export interface RawLogicommerceCategory {
  ID?: number
  PID?: string
  LANGUAGES?: RawLanguageEntry[]
  PRODUCTS?: Array<{ ID?: number; PID?: string }>
  [key: string]: unknown
}

export function transformLogicommerceCategory(raw: RawLogicommerceCategory): Collection {
  const id = requireId('category', raw.ID)
  const { name, entry } = requireName('category', id, raw.LANGUAGES)
  const out: Collection = { id, title: name, metadata: { ...raw } }
  if (typeof entry.LONGDESCRIPTION === 'string' && entry.LONGDESCRIPTION !== '') {
    out.description = entry.LONGDESCRIPTION
  }
  if (Array.isArray(raw.PRODUCTS)) {
    out.productIds = raw.PRODUCTS.filter((p) => typeof p.ID === 'number').map((p) => String(p.ID))
  }
  return out
}
