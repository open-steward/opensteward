import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

/**
 * Camelot 3PL / Excalibur WMS — item record (Inventory Out object).
 *
 * Field names follow the Excalibur REST API JSON shape for the /items endpoint.
 * All monetary amounts are stored as-received (Excalibur returns unit prices in
 * the account's base currency as decimal values; no minor-unit conversion needed
 * because the inventory schema uses raw floats for retail price amounts).
 */
export interface RawCamelot3plProduct {
  itemId: string
  sku?: string
  itemDescription?: string
  description?: string
  upc?: string
  brand?: string
  category?: string
  itemClass?: string
  unitOfMeasure?: string
  weightLbs?: number
  lengthIn?: number
  widthIn?: number
  heightIn?: number
  unitPrice?: number
  isActive?: boolean | string | number
  supplierId?: string
  supplierName?: string
  createdDate?: string
  lastModifiedDate?: string
  [key: string]: unknown
}

// 1 lb ≈ 453.592 g
const LBS_TO_GRAMS = 453.592

// 1 inch = 2.54 cm
const IN_TO_CM = 2.54

export function transformProduct(raw: RawCamelot3plProduct): Product {
  const supplierIds: string[] = []
  if (raw.supplierId) supplierIds.push(String(raw.supplierId))

  const weightLbs = typeof raw.weightLbs === 'number' ? raw.weightLbs : undefined
  const lengthIn = typeof raw.lengthIn === 'number' ? raw.lengthIn : undefined
  const widthIn = typeof raw.widthIn === 'number' ? raw.widthIn : undefined
  const heightIn = typeof raw.heightIn === 'number' ? raw.heightIn : undefined

  return {
    id: String(raw.itemId),
    externalId: String(raw.itemId),
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.itemDescription ?? raw.description) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.upc),
    brand: pickStr(raw.brand),
    category: pickStr(raw.category),
    unitOfMeasure: pickStr(raw.unitOfMeasure) ?? 'each',
    weightGrams: weightLbs !== undefined ? Math.round(weightLbs * LBS_TO_GRAMS) : undefined,
    dimensionsCm: lengthIn || widthIn || heightIn ? {
      length: lengthIn !== undefined ? lengthIn * IN_TO_CM : undefined,
      width: widthIn !== undefined ? widthIn * IN_TO_CM : undefined,
      height: heightIn !== undefined ? heightIn * IN_TO_CM : undefined,
    } : undefined,
    retailPrice: raw.unitPrice !== undefined ? { amount: raw.unitPrice, currency: 'USD' } : undefined,
    isActive: pickBool(raw.isActive) ?? true,
    parentProductId: undefined,
    supplierIds,
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.lastModifiedDate),
    platform: 'camelot-3pl',
    metadata: strMap({ itemClass: raw.itemClass, supplierName: raw.supplierName }),
    raw,
  }
}
