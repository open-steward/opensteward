import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

/**
 * Raw product object from GET /products or GET /products/{idproduct}.
 *
 * Field reference: https://picqer.com/en/api/products
 * Weight is already in grams (integer). Dimensions are in centimeters.
 * price excludes VAT, returned as float.
 */
export interface RawPicqerProduct {
  idproduct: number
  productcode: string
  productcode_supplier?: string
  barcode?: string
  name: string
  description?: string
  price?: number
  fixedstockprice?: number
  type?: string
  active?: boolean
  idsupplier?: number
  deliverytime?: number
  minimum_purchase_quantity?: number
  purchase_in_quantities_of?: number
  weight?: number
  length?: number
  width?: number
  height?: number
  hs_code?: string
  country_of_origin?: string
  analysis_abc_classification?: string
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawPicqerProduct): Product {
  const idStr = String(raw.idproduct)
  const supplierIds: string[] = raw.idsupplier ? [String(raw.idsupplier)] : []

  return {
    id: idStr,
    externalId: idStr,
    sku: raw.productcode,
    name: raw.name,
    description: pickStr(raw.description),
    upc: pickStr(raw.barcode),
    unitOfMeasure: 'each',
    weightGrams: raw.weight !== undefined ? raw.weight : undefined,
    dimensionsCm: raw.length || raw.width || raw.height ? {
      length: raw.length, width: raw.width, height: raw.height,
    } : undefined,
    retailPrice: raw.price !== undefined ? { amount: raw.price, currency: 'EUR' } : undefined,
    isActive: pickBool(raw.active) ?? true,
    supplierIds,
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'picqer',
    metadata: strMap({
      type: raw.type,
      productcode_supplier: raw.productcode_supplier,
      hs_code: raw.hs_code,
      country_of_origin: raw.country_of_origin,
      analysis_abc_classification: raw.analysis_abc_classification,
    }),
    raw,
  }
}
