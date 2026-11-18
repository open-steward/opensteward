/**
 * GoFrugal RetailEasy product transform.
 *
 * The /api/v1/items endpoint returns items with embedded per-location stock
 * entries. This transform collapses the item-level fields into a Product and
 * takes the first stock entry's price/MRP as the representative retail price.
 *
 * API response shape (per item):
 *   { itemId, itemName, locationId, stock: [{ stock, salePrice, mrp, itemReferenceCode, taxPercentage }] }
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap, toMinorUnits} from './shared'

/** A single stock entry embedded within a GoFrugal item. */
export interface RawGofrugalStockEntry {
  stock?: number
  salePrice?: number
  mrp?: number
  itemReferenceCode?: string
  taxPercentage?: number
  [key: string]: unknown
}

/** Shape of one element from GET /api/v1/items → items[]. */
export interface RawGofrugalProduct {
  itemId: number | string
  itemName?: string
  locationId?: number | string
  stock?: RawGofrugalStockEntry[]
  [key: string]: unknown
}

export function transformProduct(raw: RawGofrugalProduct): Product {
  const id = String(raw.itemId)
  // Representative price: first stock entry's salePrice (minor units, INR default)
  const firstStock = (raw.stock ?? [])[0]
  const salePriceMinor = firstStock?.salePrice !== undefined
    ? toMinorUnits(firstStock.salePrice)
    : undefined
  const mrpMinor = firstStock?.mrp !== undefined
    ? toMinorUnits(firstStock.mrp)
    : undefined
  const sku = pickStr(firstStock?.itemReferenceCode) ?? id

  return {
    id,
    externalId: id,
    sku,
    name: pickStr(raw.itemName) ?? '',
    description: undefined,
    upc: undefined,
    brand: undefined,
    category: undefined,
    unitOfMeasure: 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    // Amounts in integer minor units (paise for INR)
    retailPrice: salePriceMinor !== undefined ? { amount: salePriceMinor, currency: 'INR' } : undefined,
    isActive: true,
    parentProductId: undefined,
    supplierIds: [],
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'gofrugal',
    metadata: strMap({
      locationId: raw.locationId,
      mrpMinorUnits: mrpMinor,
      taxPercentage: firstStock?.taxPercentage,
    }),
    raw,
  }
}
