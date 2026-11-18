/**
 * Manhattan Active WM — item (product) transform.
 *
 * WM REST endpoint: GET /wm/v1/items  |  GET /wm/v1/items/{itemId}
 *
 * Manhattan Active WM calls inventory items "items".  Core identity fields
 * are itemId (system key) and itemNumber (human-readable SKU).  The platform
 * stores weight in pounds and dimensions in inches; we convert to grams and cm.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawManhattanActiveItem {
  itemId: string
  itemNumber?: string
  description?: string
  shortDescription?: string
  upc?: string
  brand?: string
  category?: string
  itemType?: string
  unitOfMeasure?: string
  /** Weight in pounds. */
  weight?: number
  /** Dimensions in inches. */
  length?: number
  width?: number
  height?: number
  retailPrice?: number
  currency?: string
  isActive?: boolean | string
  status?: string
  parentItemId?: string
  primarySupplierId?: string
  supplierIds?: string[]
  createdDateTime?: string
  lastModifiedDateTime?: string
  [key: string]: unknown
}

const LBS_TO_GRAMS = 453.592
const INCHES_TO_CM = 2.54

export function transformProduct(raw: RawManhattanActiveItem): Product {
  const suppliers: string[] = []
  if (raw.primarySupplierId) suppliers.push(raw.primarySupplierId)
  for (const s of raw.supplierIds ?? []) {
    if (!suppliers.includes(s)) suppliers.push(s)
  }

  return {
    id: raw.itemId,
    externalId: raw.itemId,
    sku: pickStr(raw.itemNumber) ?? '',
    name: pickStr(raw.description) ?? pickStr(raw.shortDescription) ?? '',
    description: pickStr(raw.shortDescription),
    upc: pickStr(raw.upc),
    brand: pickStr(raw.brand),
    category: pickStr(raw.category),
    unitOfMeasure: pickStr(raw.unitOfMeasure) ?? 'each',
    weightGrams: raw.weight !== undefined ? raw.weight * LBS_TO_GRAMS : undefined,
    dimensionsCm: raw.length || raw.width || raw.height ? {
      length: raw.length !== undefined ? raw.length * INCHES_TO_CM : undefined,
      width: raw.width !== undefined ? raw.width * INCHES_TO_CM : undefined,
      height: raw.height !== undefined ? raw.height * INCHES_TO_CM : undefined,
    } : undefined,
    retailPrice: raw.retailPrice !== undefined
      ? { amount: raw.retailPrice, currency: pickStr(raw.currency) ?? 'USD' }
      : undefined,
    isActive: pickBool(raw.isActive) ?? (raw.status ?? '').toUpperCase() !== 'INACTIVE',
    parentProductId: pickStr(raw.parentItemId),
    supplierIds: suppliers,
    createdAt: toIso(raw.createdDateTime),
    updatedAt: toIso(raw.lastModifiedDateTime),
    platform: 'manhattan-active',
    metadata: strMap({ itemType: raw.itemType, status: raw.status }),
    raw,
  }
}
