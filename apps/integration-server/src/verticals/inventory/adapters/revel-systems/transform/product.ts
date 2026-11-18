/**
 * Transform Revel Systems Product resource → canonical Product.
 *
 * Revel API endpoint:  GET /resources/Product/
 * Key fields (camelCase snake_case from Revel JSON):
 *   id, name, sku, barcode, price, cost, active,
 *   description, product_class (→ category), establishment (FK int),
 *   created_date, updated_date
 *
 * Revel prices are floating-point dollars.
 * Canonical MoneySchema.amount must be INTEGER MINOR UNITS (cents).
 * Conversion: Math.round(dollars * 100).
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso, dollarsToMinorUnits} from './shared'

export interface RawRevelProduct {
  /** Auto-increment integer primary key returned as number. */
  id: number | string
  /** Human-readable product name. */
  name?: string
  /** SKU / stock-keeping unit. */
  sku?: string
  /** Barcode / UPC. */
  barcode?: string
  /** Selling price in USD (float). */
  price?: number | string
  /** Cost of goods in USD (float). */
  cost?: number | string
  /** Whether product is active on the POS. */
  active?: boolean | number | string
  /** Free-text description. */
  description?: string
  /** Resource URI of the associated ProductClass (category). */
  product_class?: string | null
  /** Integer FK linking to the Establishment (location). */
  establishment?: number | string | null
  /** ISO-8601 created timestamp. */
  created_date?: string
  /** ISO-8601 last-updated timestamp. */
  updated_date?: string
  /** Unit of measure label, e.g. "each", "oz". */
  unit_type?: string | null
  /** Custom barcode/SKU field that some merchants populate. */
  custom_sku?: string | null
  [key: string]: unknown
}

export function transformProduct(raw: RawRevelProduct): Product {
  const id = String(raw.id)
  const priceRaw = pickNum(raw.price)
  const costRaw = pickNum(raw.cost)

  return {
    id,
    externalId: id,
    sku: pickStr(raw.sku) ?? pickStr(raw.custom_sku) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.barcode),
    category: extractCategory(raw.product_class),
    unitOfMeasure: pickStr(raw.unit_type) ?? 'each',
    // Revel returns dollar floats; canonical schema requires integer minor units (cents)
    retailPrice: priceRaw !== undefined
      ? { amount: dollarsToMinorUnits(priceRaw), currency: 'USD' }
      : undefined,
    cost: costRaw !== undefined
      ? { amount: dollarsToMinorUnits(costRaw), currency: 'USD' }
      : undefined,
    isActive: pickBool(raw.active) ?? true,
    supplierIds: [],
    createdAt: toIso(raw.created_date),
    updatedAt: toIso(raw.updated_date),
    platform: 'revel-systems',
    metadata: strMap({
      establishment: raw.establishment,
      product_class: raw.product_class,
    }),
    raw,
  }
}

/**
 * Revel returns product_class as a resource URI like "/resources/ProductClass/3/"
 * We extract just the numeric ID for the canonical category field.
 */
function extractCategory(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined
  const match = /\/(\d+)\/?$/.exec(uri)
  return match ? match[1] : pickStr(uri)
}
