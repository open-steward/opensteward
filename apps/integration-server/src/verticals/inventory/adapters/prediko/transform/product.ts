import type { Product } from '../../../schema/product'
import {pickStr, strMap} from './shared'

/**
 * Raw SKU object returned by POST /api/v1/skus (aggregation_level=SKU).
 */
export interface RawPredikoSku {
  sku_id?: string
  sku_name?: string
  product_name?: string
  supplier_name?: string
  unit_cost?: number
  unit_cost_supplier?: number
  re_order_status?: boolean
  recommended_units_to_order?: number
  sum_stock_level?: number
  sum_incoming_units?: number
  lead_time_to?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawPredikoSku): Product {
  const id = pickStr(raw.sku_id) ?? pickStr(raw.sku_name) ?? ''
  const skuName = pickStr(raw.sku_name) ?? ''
  const productName = pickStr(raw.product_name) ?? skuName

  return {
    id,
    externalId: id,
    sku: skuName,
    name: productName,
    description: undefined,
    upc: undefined,
    brand: undefined,
    category: undefined,
    unitOfMeasure: 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    retailPrice: undefined,
    isActive: true,
    parentProductId: undefined,
    supplierIds: raw.supplier_name ? [raw.supplier_name] : [],
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'prediko',
    metadata: strMap({
      productName: raw.product_name,
      supplierName: raw.supplier_name,
      reOrderStatus: raw.re_order_status,
      recommendedUnitsToOrder: raw.recommended_units_to_order,
      unitCost: raw.unit_cost,
      unitCostSupplier: raw.unit_cost_supplier,
    }),
    raw,
  }
}
