/**
 * TrueCommerce product transform.
 *
 * Field names match the TrueCommerce Foundry REST API response for
 * GET /v1/products and GET /v1/products/{itemId}.
 *
 * Key fields (snake_case per TrueCommerce REST conventions):
 *   item_id, sku, description, upc, brand, category_name, unit_of_measure,
 *   weight_lbs, length_in, width_in, height_in, unit_price, is_active,
 *   parent_item_id, supplier_ids, created_date, modified_date
 *
 * Amounts: unit_price is in MINOR UNITS (cents) when currency is USD.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawTruecommerceProduct {
  item_id: string
  sku?: string
  description?: string
  long_description?: string
  upc?: string
  brand?: string
  category_name?: string
  unit_of_measure?: string
  weight_lbs?: number | string
  length_in?: number | string
  width_in?: number | string
  height_in?: number | string
  /** Unit price in MINOR UNITS (cents). */
  unit_price?: number | string
  currency?: string
  is_active?: boolean | string | number
  parent_item_id?: string
  /** Array of supplier partner IDs. */
  supplier_ids?: string[]
  created_date?: string
  modified_date?: string
  [key: string]: unknown
}

/** Convert pounds to grams (1 lb = 453.592 g). */
function lbsToGrams(lbs: number): number {
  return Math.round(lbs * 453.592)
}

/** Convert inches to centimetres (1 in = 2.54 cm). */
function inToCm(inches: number): number {
  return Math.round(inches * 2.54 * 100) / 100
}

export function transformProduct(raw: RawTruecommerceProduct): Product {
  const weightLbs = pickNum(raw.weight_lbs)
  const lengthIn = pickNum(raw.length_in)
  const widthIn = pickNum(raw.width_in)
  const heightIn = pickNum(raw.height_in)
  const unitPrice = pickNum(raw.unit_price)

  return {
    id: raw.item_id,
    externalId: raw.item_id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.description) ?? '',
    description: pickStr(raw.long_description),
    upc: pickStr(raw.upc),
    brand: pickStr(raw.brand),
    category: pickStr(raw.category_name),
    unitOfMeasure: pickStr(raw.unit_of_measure) ?? 'each',
    weightGrams: weightLbs !== undefined ? lbsToGrams(weightLbs) : undefined,
    dimensionsCm:
      lengthIn || widthIn || heightIn
        ? {
            length: lengthIn !== undefined ? inToCm(lengthIn) : undefined,
            width: widthIn !== undefined ? inToCm(widthIn) : undefined,
            height: heightIn !== undefined ? inToCm(heightIn) : undefined,
          }
        : undefined,
    // unit_price already in minor units (cents)
    retailPrice:
      unitPrice !== undefined
        ? { amount: unitPrice, currency: pickStr(raw.currency) ?? 'USD' }
        : undefined,
    isActive: pickBool(raw.is_active) ?? true,
    parentProductId: pickStr(raw.parent_item_id),
    supplierIds: Array.isArray(raw.supplier_ids) ? raw.supplier_ids : [],
    createdAt: toIso(raw.created_date),
    updatedAt: toIso(raw.modified_date),
    platform: 'truecommerce',
    metadata: strMap({
      unitOfMeasure: raw.unit_of_measure,
      currency: raw.currency,
    }),
    raw,
  }
}
