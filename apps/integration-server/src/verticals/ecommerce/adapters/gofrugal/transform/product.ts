/**
 * GOFRUGAL Item → canonical Product.
 *
 * Docs: https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/api-integration
 *
 * `GET /items` is documented to return exactly this shape:
 * ```
 * { "items": [ { "itemId": 1, "itemName": "bat", "locationId": 225,
 *     "stock": [ { "stock": 7, "salePrice": 120, "mrp": 130,
 *                  "itemReferenceCode": "", "taxPercentage": 12 } ] } ] }
 * ```
 * `stock` is an array because one item can carry more than one priced/
 * stocked row at a location (e.g. different pack sizes under distinct
 * `itemReferenceCode` barcodes). Only `GET /items` (list) is documented —
 * there is no per-item GET, and no create/update/delete — so this is a
 * read-only, list-only resource (see ../metadata.ts).
 *
 * No currency field is reported anywhere in this API (items, stock, or
 * sales orders) — RetailEasy is not India-only (GOFRUGAL sells elsewhere
 * too), so a hardcoded currency would mislabel prices for those merchants.
 * `currency` is therefore a required parameter here, sourced from the
 * connection's own credentials (see ../client.ts and ../connect-form.ts) —
 * never defaulted.
 */

import type { Product, ProductVariant } from '../../../schema/product'
import { majorToMinor } from '../../../schema/shared'

export interface RawGofrugalStockEntry {
  /** Always shown in the documented `GET /items` example — required so a missing value fails loudly instead of reporting a fabricated 0. */
  stock: number
  salePrice?: number
  mrp?: number
  itemReferenceCode?: string
  taxPercentage?: number
}

export interface RawGofrugalItem {
  itemId: number
  itemName: string
  locationId: number
  stock?: RawGofrugalStockEntry[]
  [key: string]: unknown
}

function buildVariant(
  raw: RawGofrugalItem,
  entry: RawGofrugalStockEntry | undefined,
  currency: string,
): ProductVariant | undefined {
  if (!entry || entry.salePrice == null) return undefined
  return {
    id: `${raw.itemId}:default`,
    productId: String(raw.itemId),
    sku: entry.itemReferenceCode || undefined,
    price: { amount: majorToMinor(entry.salePrice, currency), currency },
    compareAtPrice:
      entry.mrp != null ? { amount: majorToMinor(entry.mrp, currency), currency } : undefined,
    taxable: entry.taxPercentage != null ? entry.taxPercentage > 0 : undefined,
    metadata: { ...entry, locationId: raw.locationId },
  }
}

/** `currency` — the connection's own ISO 4217 code (see file header); never defaulted. */
export function transformProduct(raw: RawGofrugalItem, currency: string): Product {
  const variant = buildVariant(raw, raw.stock?.[0], currency)
  return {
    id: String(raw.itemId),
    title: raw.itemName,
    variants: variant ? [variant] : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
