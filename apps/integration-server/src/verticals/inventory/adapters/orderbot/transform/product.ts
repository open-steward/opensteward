/**
 * Orderbot product transform.
 *
 * The GET /products endpoint returns an array of product objects.
 * Field names reflect the public Orderbot REST API as documented in the
 * open-source workarea-orderbot integration and the Swagger UI at
 * https://api-beta.orderbot.com/documentation/index.html.
 *
 * Note: Orderbot surfaces pricing as decimal dollars.  We store
 * retailPrice.amount as-is (decimal) — the schema allows decimal money
 * for price display fields (not minor-unit integers, which apply only to
 * transactional amounts).
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawOrderbotProduct {
  id?: string | number
  sku?: string
  name?: string
  description?: string
  upc?: string
  barcode?: string
  brand?: string
  category?: string
  product_type?: string
  weight?: number | string
  length?: number | string
  width?: number | string
  height?: number | string
  price?: number | string
  cost?: number | string
  active?: boolean | string | number
  status?: string
  parent_id?: string | number
  supplier_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawOrderbotProduct): Product {
  const id = String(raw.id ?? '')
  const supplierIds: string[] = []
  const supplierId = pickStr(raw.supplier_id !== undefined ? String(raw.supplier_id) : undefined)
  if (supplierId) supplierIds.push(supplierId)

  const price = pickNum(raw.price)

  return {
    id,
    externalId: id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.upc) ?? pickStr(raw.barcode),
    brand: pickStr(raw.brand),
    category: pickStr(raw.category),
    unitOfMeasure: 'each',
    weightGrams: raw.weight !== undefined ? (pickNum(raw.weight) ?? 0) * 1000 : undefined,
    dimensionsCm:
      raw.length || raw.width || raw.height
        ? {
            length: pickNum(raw.length),
            width: pickNum(raw.width),
            height: pickNum(raw.height),
          }
        : undefined,
    retailPrice: price !== undefined ? { amount: price, currency: 'USD' } : undefined,
    isActive: pickBool(raw.active) ?? (raw.status?.toString().toLowerCase() !== 'inactive'),
    parentProductId: raw.parent_id !== undefined ? String(raw.parent_id) : undefined,
    supplierIds,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'orderbot',
    metadata: strMap({
      productType: raw.product_type,
      status: raw.status,
    }),
    raw,
  }
}
