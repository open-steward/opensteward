import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap} from './shared'

/**
 * Shape returned by GET /api/Products (ProductsResponseDto).
 *
 * Official StockTrim field names used here:
 *   suppliers[].supplierId   — supplier code / identifier
 *   suppliers[].supplierName — supplier display name
 *   stockLocations[].locationCode / .locationName / .stockOnHand / .stockOnOrder
 */
export interface RawStockTrimProduct {
  productId: string
  productCodeReadable?: string
  name?: string
  category?: string
  subCategory?: string
  barcode?: string
  cost?: number
  price?: number
  supplierCode?: string
  suppliers?: Array<{ supplierId?: string; supplierName?: string }>
  stockLocations?: Array<{
    locationCode?: string
    locationName?: string
    stockOnHand?: number
    stockOnOrder?: number
  }>
  stockOnHand?: number
  stockOnOrder?: number
  weight?: number
  height?: number
  width?: number
  length?: number
  minimumOrderQuantity?: number
  leadTime?: number
  discontinued?: boolean
  unstocked?: boolean
  parentId?: string
  variantType?: string
  variant?: string
  option1?: string
  option2?: string
  option3?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawStockTrimProduct): Product {
  const supplierIds: string[] = []
  if (raw.supplierCode) supplierIds.push(raw.supplierCode)
  for (const s of raw.suppliers ?? []) {
    const sid = s.supplierId ?? s.supplierName
    if (sid && !supplierIds.includes(sid)) supplierIds.push(sid)
  }

  // StockTrim price is a float; convert to integer minor units (cents)
  const retailPriceMinor =
    raw.price !== undefined ? Math.round(raw.price * 100) : undefined

  const isActive = !(pickBool(raw.discontinued) ?? false) && !(pickBool(raw.unstocked) ?? false)

  return {
    id: raw.productId,
    externalId: raw.productId,
    sku: pickStr(raw.productCodeReadable) ?? raw.productId,
    name: pickStr(raw.name) ?? '',
    upc: pickStr(raw.barcode),
    category: pickStr(raw.category),
    unitOfMeasure: 'each',
    weightGrams: raw.weight !== undefined ? raw.weight * 1000 : undefined,
    dimensionsCm:
      raw.length || raw.width || raw.height
        ? { length: raw.length, width: raw.width, height: raw.height }
        : undefined,
    retailPrice:
      retailPriceMinor !== undefined
        ? { amount: retailPriceMinor, currency: 'USD' }
        : undefined,
    isActive,
    parentProductId: pickStr(raw.parentId),
    supplierIds,
    platform: 'stocktrim',
    metadata: strMap({
      subCategory: raw.subCategory,
      variantType: raw.variantType,
      variant: raw.variant,
      option1: raw.option1,
      option2: raw.option2,
      option3: raw.option3,
      leadTime: raw.leadTime,
      minimumOrderQuantity: raw.minimumOrderQuantity,
    }),
    raw,
  }
}
