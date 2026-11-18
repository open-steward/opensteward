/**
 * SPS Commerce Fulfillment API — item/product transform.
 *
 * Wire field names follow SPS Commerce REST API standards (snake_case).
 * Reference: GET /fulfillment/v1/items, GET /fulfillment/v1/items/{itemId}
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawSpsCommerceProduct {
  /** SPS Commerce internal item identifier */
  item_id: string
  /** Buyer-assigned item number / SKU */
  buyer_item_number?: string
  /** Vendor-assigned item number */
  vendor_item_number?: string
  /** Consumer Unit UPC-A barcode */
  upc?: string
  /** GTIN-14 */
  gtin?: string
  /** Human-readable product description */
  item_description?: string
  /** Extended / long description */
  product_description?: string
  /** Brand name */
  brand_name?: string
  /** Merchandise category */
  category?: string
  /** Unit of measure (EA, CS, PK, etc.) */
  unit_of_measure?: string
  /** Unit price */
  unit_price?: number
  /** Currency code (ISO 4217) */
  currency_code?: string
  /** Whether the item is currently active */
  is_active?: boolean | string
  /** Item status string */
  status?: string
  /** Vendor / supplier ID */
  vendor_id?: string
  /** Weight in pounds */
  weight?: number
  /** Weight unit (LB, KG, etc.) */
  weight_unit?: string
  /** Pack size */
  pack?: number
  /** Inner pack quantity */
  inner_pack?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

const WEIGHT_GRAMS: Record<string, number> = {
  LB: 453.592,
  KG: 1000,
  OZ: 28.3495,
  G: 1,
}

export function transformProduct(raw: RawSpsCommerceProduct): Product {
  const weightUnit = (raw.weight_unit ?? 'LB').toUpperCase()
  const weightGrams =
    raw.weight !== undefined
      ? raw.weight * (WEIGHT_GRAMS[weightUnit] ?? 453.592)
      : undefined

  return {
    id: raw.item_id,
    externalId: raw.item_id,
    sku: pickStr(raw.vendor_item_number ?? raw.buyer_item_number) ?? '',
    name: pickStr(raw.item_description ?? raw.product_description) ?? '',
    description: pickStr(raw.product_description),
    upc: pickStr(raw.upc ?? raw.gtin),
    brand: pickStr(raw.brand_name),
    category: pickStr(raw.category),
    unitOfMeasure: pickStr(raw.unit_of_measure) ?? 'each',
    weightGrams,
    retailPrice:
      raw.unit_price !== undefined
        ? { amount: raw.unit_price, currency: pickStr(raw.currency_code) ?? 'USD' }
        : undefined,
    isActive: pickBool(raw.is_active) ?? (raw.status ?? '').toLowerCase() !== 'inactive',
    supplierIds: raw.vendor_id ? [raw.vendor_id] : [],
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'sps-commerce',
    metadata: strMap({
      buyerItemNumber: raw.buyer_item_number,
      vendorItemNumber: raw.vendor_item_number,
      status: raw.status,
      pack: raw.pack,
      innerPack: raw.inner_pack,
    }),
    raw,
  }
}
