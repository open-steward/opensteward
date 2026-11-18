import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

/**
 * Raw product record from ShipEdge Inventory v2 /get_products and /get_product.
 *
 * Field source: POST /get_products response `result.products[]`
 * and POST /get_product response `result`.
 */
export interface RawShipEdgeProduct {
  product_id: string | number
  sku?: string
  upc?: string
  description?: string
  /** Weight in lbs */
  weight?: number | string
  width?: number | string
  height?: number | string
  length?: number | string
  cost?: number | string
  retail?: number | string
  /** `{ id, name }` object */
  distribution_center?: { id?: string | number; name?: string }
  /** `{ id, name }` object */
  supplier?: { id?: string | number; name?: string }
  /** `{ id, name }` object */
  package_type?: { id?: string | number; name?: string }
  quantity_available?: number | string
  quantity_in_warehouse?: number | string
  quantity_hurt?: number | string
  quantity_shipped?: number | string
  harmonization_code?: string
  discontinued?: boolean | string | number
  created_date?: string
  updated_date?: string
  attributes?: unknown
  [key: string]: unknown
}

export function transformProduct(raw: RawShipEdgeProduct): Product {
  const productId = String(raw.product_id)
  const supplierId = raw.supplier?.id != null ? String(raw.supplier.id) : undefined

  // ShipEdge weight is in lbs; convert to grams (1 lb ≈ 453.592 g)
  const weightLbs = pickNum(raw.weight)
  const weightGrams = weightLbs !== undefined ? Math.round(weightLbs * 453.592) : undefined

  // Dimensions are in inches; convert to cm (1 in = 2.54 cm)
  const lengthIn = pickNum(raw.length)
  const widthIn = pickNum(raw.width)
  const heightIn = pickNum(raw.height)
  const hasDims = lengthIn !== undefined || widthIn !== undefined || heightIn !== undefined

  // ShipEdge retail price is a decimal dollar amount — store in integer minor units (cents)
  const retailDollars = pickNum(raw.retail)
  const retailCents = retailDollars !== undefined ? Math.round(retailDollars * 100) : undefined

  return {
    id: productId,
    externalId: productId,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.description) ?? pickStr(raw.sku) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.upc),
    brand: undefined,
    category: undefined,
    unitOfMeasure: 'each',
    weightGrams,
    dimensionsCm: hasDims ? {
      length: lengthIn !== undefined ? lengthIn * 2.54 : undefined,
      width: widthIn !== undefined ? widthIn * 2.54 : undefined,
      height: heightIn !== undefined ? heightIn * 2.54 : undefined,
    } : undefined,
    retailPrice: retailCents !== undefined ? { amount: retailCents, currency: 'USD' } : undefined,
    isActive: !pickBool(raw.discontinued),
    parentProductId: undefined,
    supplierIds: supplierId ? [supplierId] : [],
    createdAt: toIso(raw.created_date),
    updatedAt: toIso(raw.updated_date),
    platform: 'shipedge',
    metadata: strMap({
      harmonizationCode: raw.harmonization_code,
      distributionCenter: raw.distribution_center?.name,
      packageType: raw.package_type?.name,
      supplierName: raw.supplier?.name,
    }),
    raw,
  }
}
