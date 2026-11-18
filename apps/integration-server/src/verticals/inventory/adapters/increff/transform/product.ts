/**
 * Increff SKU (product) transform.
 *
 * Increff uses "SKU master" objects. The canonical identifier is skuCode
 * (client's own SKU code). Increff also assigns an internal increffSkuCode.
 * Weight is stored in grams. Dimensions not exposed in standard API.
 * MRP (maximum retail price) is the closest proxy to retail price; it is
 * stored in minor units relative to the currency — we treat it as a decimal
 * amount since Increff returns it as-is.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawIncreffProduct {
  /** Increff-assigned internal SKU identifier */
  increffSkuCode?: string
  /** Client's own SKU code — primary external ID */
  skuCode: string
  /** Human-readable name / description */
  name?: string
  description?: string
  /** EAN / barcode */
  ean?: string
  barcode?: string
  brand?: string
  category?: string
  styleCode?: string
  color?: string
  size?: string
  /** Weight in grams */
  weight?: number
  /** Maximum retail price (decimal, in local currency) */
  mrp?: number
  currency?: string
  /** Whether this SKU is currently active */
  status?: string
  isActive?: boolean | string
  supplierCode?: string
  createdOn?: string
  updatedOn?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawIncreffProduct): Product {
  const id = pickStr(raw.skuCode) ?? pickStr(raw.increffSkuCode) ?? ''
  const isActive =
    pickBool(raw.isActive) ??
    (raw.status ? (raw.status as string).toLowerCase() !== 'inactive' : true)

  return {
    id,
    externalId: pickStr(raw.increffSkuCode) ?? id,
    sku: pickStr(raw.skuCode) ?? '',
    name: pickStr(raw.name) ?? pickStr(raw.skuCode) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.ean) ?? pickStr(raw.barcode),
    brand: pickStr(raw.brand),
    category: pickStr(raw.category),
    unitOfMeasure: 'each',
    weightGrams: raw.weight !== undefined ? Number(raw.weight) : undefined,
    retailPrice: raw.mrp !== undefined ? { amount: Number(raw.mrp), currency: pickStr(raw.currency) ?? 'INR' } : undefined,
    isActive,
    supplierIds: raw.supplierCode ? [String(raw.supplierCode)] : [],
    createdAt: toIso(raw.createdOn),
    updatedAt: toIso(raw.updatedOn),
    platform: 'increff',
    metadata: strMap({ styleCode: raw.styleCode, color: raw.color, size: raw.size, status: raw.status }),
    raw,
  }
}
