/**
 * Transform Texada CloudLink product/equipment-model records into the
 * canonical inventory Product schema.
 *
 * Texada calls these "Items" or "Equipment Models" — each represents a
 * category of rental/service equipment (e.g. "Cat 320 Excavator").
 * Field names follow Texada CloudLink camelCase JSON conventions.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso, dollarsToMinorUnits} from './shared'

export interface RawTexadaProduct {
  /** Texada internal item/model identifier */
  itemNo?: string
  id?: string
  /** Human-readable product/model name */
  description?: string
  name?: string
  /** Stock-keeping unit / manufacturer model number */
  modelNo?: string
  sku?: string
  /** Product category or equipment class */
  category?: string
  productGroup?: string
  /** Manufacturer / brand */
  manufacturer?: string
  brand?: string
  /** Unit of measure */
  unitOfMeasure?: string
  /** Rental/sale rate in the account's base currency (decimal dollars) */
  dailyRate?: number
  weeklyRate?: number
  monthlyRate?: number
  salePrice?: number
  /** Whether this item is currently active/available for rental */
  active?: boolean | string
  status?: string
  /** Weight in kg */
  weightKg?: number
  /** Dimensions */
  lengthCm?: number
  widthCm?: number
  heightCm?: number
  /** Default supplier/vendor ID */
  primaryVendorId?: string
  vendorId?: string
  /** Timestamps */
  createdDate?: string
  modifiedDate?: string
  lastModified?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawTexadaProduct): Product {
  const id = pickStr(raw.itemNo ?? raw.id) ?? ''
  const sku = pickStr(raw.modelNo ?? raw.sku) ?? ''
  const name = pickStr(raw.description ?? raw.name) ?? ''
  const category = pickStr(raw.category ?? raw.productGroup)
  const brand = pickStr(raw.manufacturer ?? raw.brand)

  const isActive = raw.active !== undefined
    ? pickBool(raw.active) ?? true
    : (raw.status ?? '').toLowerCase() !== 'inactive'

  const weightGrams = raw.weightKg !== undefined ? raw.weightKg * 1000 : undefined
  const hasDims = raw.lengthCm || raw.widthCm || raw.heightCm
  const dimensionsCm = hasDims ? {
    length: raw.lengthCm,
    width: raw.widthCm,
    height: raw.heightCm,
  } : undefined

  // Use daily rate as canonical retail price; Texada stores rates in decimal
  // dollars but the canonical schema requires INTEGER MINOR UNITS (cents).
  const retailPrice = raw.dailyRate !== undefined
    ? { amount: dollarsToMinorUnits(raw.dailyRate), currency: 'USD' }
    : raw.salePrice !== undefined
      ? { amount: dollarsToMinorUnits(raw.salePrice), currency: 'USD' }
      : undefined

  const supplierIds: string[] = []
  const suppId = pickStr(raw.primaryVendorId ?? raw.vendorId)
  if (suppId) supplierIds.push(suppId)

  return {
    id,
    externalId: id,
    sku,
    name,
    description: undefined,
    upc: undefined,
    brand,
    category,
    unitOfMeasure: pickStr(raw.unitOfMeasure) ?? 'each',
    weightGrams,
    dimensionsCm,
    retailPrice,
    isActive,
    parentProductId: undefined,
    supplierIds,
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.modifiedDate ?? raw.lastModified),
    platform: 'texada',
    metadata: strMap({
      dailyRate: raw.dailyRate,
      weeklyRate: raw.weeklyRate,
      monthlyRate: raw.monthlyRate,
      status: raw.status,
    }),
    raw,
  }
}
