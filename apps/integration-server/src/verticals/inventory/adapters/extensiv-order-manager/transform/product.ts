/**
 * Transform Extensiv Order Manager product response → canonical Product.
 *
 * Real API fields from GET /api/v1.1/products:
 *   productId, masterSku, name, description, upc, mpn, brand, type,
 *   active, parentId, weight (oz integer), ounces, pounds,
 *   length, width, height (integer dimensions),
 *   vendorCost { amount (minor units integer), currency },
 *   createdDate, modifiedDate, categories[], bundle, digital, hazmat
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawExtensivProduct {
  productId?: number | string
  masterSku?: string | null
  name?: string | null
  description?: string | null
  upc?: string | null
  mpn?: string | null
  brand?: string | null
  type?: string | null
  active?: boolean | null
  parentId?: number | string | null
  /** weight in ounces (integer) */
  weight?: number | null
  /** weight in ounces, alternative field */
  ounces?: number | null
  /** length in inches (integer) */
  length?: number | null
  /** width in inches (integer) */
  width?: number | null
  /** height in inches (integer) */
  height?: number | null
  /** unit cost in INTEGER MINOR UNITS (cents) */
  vendorCost?: { amount?: number | null; currency?: string | null } | null
  createdDate?: string | null
  modifiedDate?: string | null
  categories?: Array<string | { name?: string }> | null
  bundle?: boolean | null
  digital?: boolean | null
  hazmat?: boolean | null
  [key: string]: unknown
}

/** Ounces → grams (1 oz = 28.3495 g), returns undefined if falsy */
function ozToGrams(oz: number | null | undefined): number | undefined {
  if (oz == null || oz === 0) return undefined
  return Math.round(oz * 28.3495)
}

/** Inches → centimetres */
function inToCm(inches: number | null | undefined): number | undefined {
  if (inches == null) return undefined
  return Math.round(inches * 2.54 * 100) / 100
}

export function transformProduct(raw: RawExtensivProduct): Product {
  const id = String(raw.productId ?? '')
  const weightGrams = ozToGrams(raw.weight ?? raw.ounces)
  const lengthCm = inToCm(raw.length)
  const widthCm = inToCm(raw.width)
  const heightCm = inToCm(raw.height)

  // vendorCost.amount is already integer minor units (cents)
  const costAmount = raw.vendorCost?.amount ?? undefined
  const costCurrency = pickStr(raw.vendorCost?.currency) ?? 'USD'

  const firstCategory = Array.isArray(raw.categories) && raw.categories.length > 0
    ? (typeof raw.categories[0] === 'string' ? raw.categories[0] : (raw.categories[0] as { name?: string }).name)
    : undefined

  return {
    id,
    externalId: id,
    sku: pickStr(raw.masterSku) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.upc),
    brand: pickStr(raw.brand),
    category: pickStr(firstCategory),
    unitOfMeasure: 'each',
    weightGrams,
    dimensionsCm: lengthCm != null || widthCm != null || heightCm != null
      ? { length: lengthCm, width: widthCm, height: heightCm }
      : undefined,
    // cost in minor units (cents) → retail price
    retailPrice: costAmount != null ? { amount: costAmount, currency: costCurrency } : undefined,
    isActive: pickBool(raw.active) ?? true,
    parentProductId: raw.parentId != null ? String(raw.parentId) : undefined,
    supplierIds: [],
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.modifiedDate),
    platform: 'extensiv-order-manager',
    metadata: strMap({
      type: raw.type,
      bundle: raw.bundle,
      digital: raw.digital,
      hazmat: raw.hazmat,
    }),
    raw,
  }
}
