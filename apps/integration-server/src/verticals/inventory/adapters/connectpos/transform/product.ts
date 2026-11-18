import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

/**
 * Shape returned by GET ?path=product (ConnectPOS / SM_XRetail module).
 * Fields are standard Magento 2 catalog_product EAV attributes merged with
 * CatalogInventory stock_item data under the stock_items key.
 */
export interface RawConnectposProduct {
  entity_id: string | number
  sku?: string
  name?: string
  description?: string
  short_description?: string
  price?: number | string
  special_price?: number | string
  /** Magento product status: 1 = enabled, 2 = disabled */
  status?: number | string
  /** simple | configurable | virtual | bundle | grouped */
  type_id?: string
  /** weight in kg (Magento default) */
  weight?: number | string
  visibility?: number | string
  /** barcode / UPC custom attribute often named 'barcode' in ConnectPOS stores */
  barcode?: string
  /** brand custom attribute */
  brand?: string
  /** manufacturer attribute */
  manufacturer?: string
  category_ids?: Array<string | number>
  /** CatalogInventory stock data merged into product response */
  stock_items?: {
    qty?: number | string
    is_in_stock?: number | string | boolean
    manage_stock?: number | string | boolean
    min_qty?: number | string
    backorders?: number | string
  }
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawConnectposProduct): Product {
  const entityId = String(raw.entity_id)
  const stockItems = raw.stock_items ?? {}
  const isInStock = pickBool(stockItems.is_in_stock)
  const manageStock = pickBool(stockItems.manage_stock)
  // Magento status: 1 = enabled
  const isActive = Number(raw.status ?? 1) === 1
  const price = pickNum(raw.price)
  const brand = pickStr(raw.brand) ?? pickStr(raw.manufacturer)
  // Magento weight is in kg; pickNum guards non-numeric values (avoids NaN)
  const weightKg = pickNum(raw.weight)

  return {
    id: entityId,
    externalId: entityId,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description) ?? pickStr(raw.short_description),
    upc: pickStr(raw.barcode),
    brand,
    category: (raw.category_ids ?? []).map(String).join(',') || undefined,
    unitOfMeasure: 'each',
    // Convert kg → grams as integer; pickNum above already guards non-numeric inputs
    weightGrams: weightKg !== undefined ? Math.round(weightKg * 1000) : undefined,
    // Magento prices are major units (e.g. 49.99); canonical amount is integer minor units (cents)
    retailPrice: price !== undefined ? { amount: Math.round(price * 100), currency: 'USD' } : undefined,
    isActive,
    supplierIds: [],
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'connectpos',
    metadata: strMap({
      typeId: raw.type_id,
      visibility: raw.visibility,
      manageStock,
      isInStock,
      qty: stockItems.qty,
    }),
    raw,
  }
}
