/**
 * Da Vinci Unified — item/product transform.
 *
 * DVU API field names follow camelCase conventions typical of the wdgcorp REST
 * layer: itemId, itemNumber (= SKU), description, upc, vendorId, unitOfMeasure,
 * unitWeight (lbs), retailPrice (decimal USD), isActive, createDate, lastModifiedDate.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawDaVinciUnifiedProduct {
  itemId: string
  itemNumber?: string
  description?: string
  extendedDescription?: string
  upc?: string
  vendorId?: string
  vendorItemNumber?: string
  categoryCode?: string
  unitOfMeasure?: string
  unitWeight?: number
  unitLength?: number
  unitWidth?: number
  unitHeight?: number
  retailPrice?: number
  isActive?: boolean | string
  createDate?: string
  lastModifiedDate?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawDaVinciUnifiedProduct): Product {
  const suppliers: string[] = []
  if (raw.vendorId) suppliers.push(String(raw.vendorId))

  // DVU unitWeight is in lbs; convert to grams (1 lb = 453.592 g)
  const weightGrams =
    raw.unitWeight !== undefined ? Math.round(raw.unitWeight * 453.592) : undefined

  return {
    id: raw.itemId,
    externalId: raw.itemId,
    sku: pickStr(raw.itemNumber) ?? '',
    name: pickStr(raw.description) ?? '',
    description: pickStr(raw.extendedDescription),
    upc: pickStr(raw.upc),
    brand: undefined,
    category: pickStr(raw.categoryCode),
    unitOfMeasure: pickStr(raw.unitOfMeasure) ?? 'each',
    weightGrams,
    dimensionsCm:
      raw.unitLength || raw.unitWidth || raw.unitHeight
        ? {
            // DVU stores dimensions in inches; convert to cm (1 in = 2.54 cm)
            length: raw.unitLength !== undefined ? raw.unitLength * 2.54 : undefined,
            width: raw.unitWidth !== undefined ? raw.unitWidth * 2.54 : undefined,
            height: raw.unitHeight !== undefined ? raw.unitHeight * 2.54 : undefined,
          }
        : undefined,
    retailPrice:
      raw.retailPrice !== undefined ? { amount: raw.retailPrice, currency: 'USD' } : undefined,
    isActive: pickBool(raw.isActive) ?? true,
    parentProductId: undefined,
    supplierIds: suppliers,
    createdAt: toIso(raw.createDate),
    updatedAt: toIso(raw.lastModifiedDate),
    platform: 'da-vinci-unified',
    metadata: strMap({
      vendorItemNumber: raw.vendorItemNumber,
      unitOfMeasure: raw.unitOfMeasure,
    }),
    raw,
  }
}
