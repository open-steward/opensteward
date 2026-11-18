/**
 * AdvancePro product transform.
 *
 * GET /api/Products returns an array of product objects.
 *
 * Real API response fields (snake_case) confirmed from AdvancePro docs:
 *   id, sku, name, upc, description, type, category_id, tags,
 *   selling_price, cost, suggested_retail_price,
 *   available_quantity, total_quantity,
 *   unit_id, unit_name, weight, length, width, height,
 *   taxable, drop_ship, use_serial_number, use_lot_number,
 *   vendor_id, vendor_name, brand,
 *   active, deleted, date_updated
 *
 * Prices are integer dollar amounts in the API (e.g. 1566 = $1566).
 * Canonical amounts are integer minor units (cents): multiply by 100.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawAdvanceProProduct {
  id?: string | number
  sku?: string
  name?: string
  upc?: string
  description?: string
  type?: string
  // Real API uses snake_case field names
  category_id?: string | number
  category?: string
  tags?: string
  selling_price?: number | string
  // legacy camelCase aliases kept for forward-compat
  sellingPrice?: number | string
  cost?: number | string
  suggested_retail_price?: number | string
  suggestedRetailPrice?: number | string
  available_quantity?: number | string
  available?: number | string
  total_quantity?: number | string
  total?: number | string
  unit_id?: string | number
  unit_name?: string
  unit?: string
  weight?: number | string
  length?: number | string
  width?: number | string
  height?: number | string
  taxable?: boolean | string
  drop_ship?: boolean | string
  dropShip?: boolean | string
  use_serial_number?: boolean | string
  trackSerial?: boolean | string
  use_lot_number?: boolean | string
  trackLot?: boolean | string
  vendor_id?: string | number
  vendorId?: string | number
  vendor_name?: string
  vendorName?: string
  brand?: string
  active?: boolean | string | number
  isActive?: boolean | string | number
  deleted?: boolean | string | number
  date_updated?: string
  modifiedDate?: string
  lastModified?: string
  createdDate?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawAdvanceProProduct): Product {
  const externalId = String(raw.id ?? '')
  const supplierIds: string[] = []
  const vid = raw.vendor_id ?? raw.vendorId
  if (vid != null) supplierIds.push(String(vid))

  // selling_price / sellingPrice is an integer dollar amount — convert to minor units (cents)
  const sellingDollars = pickNum(raw.selling_price ?? raw.sellingPrice)
  const retailPrice = sellingDollars !== undefined
    ? { amount: Math.round(sellingDollars * 100), currency: 'USD' }
    : undefined

  const weight = pickNum(raw.weight)
  const length = pickNum(raw.length)
  const width = pickNum(raw.width)
  const height = pickNum(raw.height)

  const isActive = pickBool(raw.active ?? raw.isActive) ?? true

  return {
    id: externalId,
    externalId,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.upc),
    brand: pickStr(raw.brand),
    category: pickStr(raw.category),
    unitOfMeasure: pickStr(raw.unit_name ?? raw.unit) ?? 'each',
    weightGrams: weight !== undefined ? weight * 453.592 : undefined, // lbs → grams
    dimensionsCm: length || width || height
      ? { length, width, height }
      : undefined,
    retailPrice,
    isActive,
    supplierIds,
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.date_updated ?? raw.modifiedDate ?? raw.lastModified),
    platform: 'advance-pro',
    metadata: strMap({
      type: raw.type,
      tags: raw.tags,
      taxable: raw.taxable,
      drop_ship: raw.drop_ship ?? raw.dropShip,
      use_serial_number: raw.use_serial_number ?? raw.trackSerial,
      use_lot_number: raw.use_lot_number ?? raw.trackLot,
      vendor_name: raw.vendor_name ?? raw.vendorName,
    }),
    raw,
  }
}
