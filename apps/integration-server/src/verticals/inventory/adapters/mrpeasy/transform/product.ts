import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap} from './shared'

/**
 * Raw item shape from GET /items and GET /items/{id}.
 * Field names sourced from MRPeasy REST API v1 documentation.
 */
export interface RawMrpeasyProduct {
  article_id: number | string
  code?: string
  title?: string
  description?: string
  barcode?: string
  unit?: string
  unit_id?: number | string
  group_id?: number | string
  group_title?: string
  selling_price?: number | string
  avg_cost?: number | string
  weight?: number | string
  is_raw?: boolean | number
  not_for_sale?: boolean | number
  is_inventory?: boolean | number
  deleted?: boolean | number
  min_quantity?: number | string
  [key: string]: unknown
}

export function transformProduct(raw: RawMrpeasyProduct): Product {
  const id = String(raw.article_id)
  const sellingPrice = pickNum(raw.selling_price)

  return {
    id,
    externalId: id,
    sku: pickStr(raw.code) ?? '',
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.barcode),
    brand: undefined,
    category: pickStr(raw.group_title),
    unitOfMeasure: pickStr(raw.unit) ?? 'each',
    weightGrams: raw.weight !== undefined ? (pickNum(raw.weight) ?? 0) * 1000 : undefined,
    dimensionsCm: undefined,
    retailPrice: sellingPrice !== undefined ? { amount: sellingPrice, currency: 'USD' } : undefined,
    isActive: pickBool(raw.deleted) === true ? false : true,
    parentProductId: undefined,
    supplierIds: [],
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'mrpeasy',
    metadata: strMap({
      unitId: raw.unit_id,
      groupId: raw.group_id,
      avgCost: raw.avg_cost,
      isRaw: raw.is_raw,
      notForSale: raw.not_for_sale,
      isInventory: raw.is_inventory,
      minQuantity: raw.min_quantity,
    }),
    raw,
  }
}
