/**
 * ERPAG item (product/service) transform.
 *
 * GET /item?id={id} response shape:
 * {
 *   basicInfo: { sku, description, eanUpc, uom, active }
 *   sellingPrice: number
 *   productCategory: { productType, category, trademark, taxCategory }
 *   suppliers: Array<{ key, supplier, ... }>
 *   inventory: Array<{ warehouse, quantity, ... }>
 *   billsOfMaterials: []
 *   serialNumbersLotNumbers: []
 * }
 *
 * The item's `key` (string ID) is supplied by the caller (it comes from the
 * /items list endpoint) and passed in as `id`.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap} from './shared'

export interface RawErpagBasicInfo {
  sku?: string
  description?: string
  eanUpc?: string
  uom?: string
  active?: boolean
}

export interface RawErpagProductCategory {
  productType?: string
  category?: string
  trademark?: string
  taxCategory?: string
}

export interface RawErpagSupplierRef {
  key?: string
  supplier?: string
  [key: string]: unknown
}

export interface RawErpagInventoryEntry {
  warehouse?: string
  quantity?: number
  available?: number
  reserved?: number
  onOrder?: number
  reorderPoint?: number
  reorderQuantity?: number
  [key: string]: unknown
}

export interface RawErpagProduct {
  /** Populated by the adapter from the /items list — not present in the /item body itself. */
  id: string
  basicInfo?: RawErpagBasicInfo
  sellingPrice?: number
  productCategory?: RawErpagProductCategory
  suppliers?: RawErpagSupplierRef[]
  inventory?: RawErpagInventoryEntry[]
  [key: string]: unknown
}

export function transformProduct(raw: RawErpagProduct): Product {
  const basic = raw.basicInfo ?? {}
  const category = raw.productCategory ?? {}
  const supplierIds = (raw.suppliers ?? [])
    .map((s) => pickStr(s.key))
    .filter((v): v is string => v !== undefined)

  return {
    id: raw.id,
    externalId: raw.id,
    sku: pickStr(basic.sku) ?? '',
    name: pickStr(basic.description) ?? '',
    upc: pickStr(basic.eanUpc),
    unitOfMeasure: pickStr(basic.uom) ?? 'each',
    retailPrice: raw.sellingPrice !== undefined
      ? { amount: raw.sellingPrice, currency: 'USD' }
      : undefined,
    isActive: pickBool(basic.active) ?? true,
    category: pickStr(category.category),
    supplierIds,
    platform: 'erpag',
    metadata: strMap({
      productType: category.productType,
      trademark: category.trademark,
      taxCategory: category.taxCategory,
    }),
    raw,
  }
}
