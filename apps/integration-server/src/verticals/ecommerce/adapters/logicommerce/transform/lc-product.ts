/**
 * LogiCommerce product → canonical Product.
 *
 * Source: GET /products and GET /products/{id}
 * (https://api-sync.logicommerce.cloud/docs/reference.cfm?module=products&languageId=2).
 * The documented example product carries `"ID" : 1`, `"PID" :"abc"` and
 * `"LANGUAGES": [{ "LANGUAGE" :"ES", "LONGDESCRIPTION" :"Product long
 * description", "NAME" :"Product name", … }]`.
 *
 * Only those fields are mapped. Prices are not: the documented `PRICES`
 * entries carry `BASEPRICE`/`RETAILPRICE` and a `CURRENCIES` list without
 * saying which one a variant sells at, and product `COMBINATIONS` carry no
 * price at all, so the product has no `variants`. The whole record stays in
 * `metadata`.
 */
import type { Product } from '../../../schema/product'
import { requireId, requireName, type RawLanguageEntry } from '../languages'

export interface RawLogicommerceProduct {
  ID?: number
  PID?: string
  LANGUAGES?: RawLanguageEntry[]
  [key: string]: unknown
}

export function transformLogicommerceProduct(raw: RawLogicommerceProduct): Product {
  const id = requireId('product', raw.ID)
  const { name, entry } = requireName('product', id, raw.LANGUAGES)
  const out: Product = { id, title: name, metadata: { ...raw } }
  if (typeof entry.LONGDESCRIPTION === 'string' && entry.LONGDESCRIPTION !== '') {
    out.description = entry.LONGDESCRIPTION
  }
  return out
}
