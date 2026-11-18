/**
 * Orca Scan row → Product
 *
 * Each row in an Orca Scan sheet represents a scanned item (product/SKU).
 * System fields are prefixed with `_` (e.g. `_id`); user-defined columns
 * use the field key as assigned in sheet settings (common defaults: barcode,
 * name, quantity, location, description, date).
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawOrcaScanRow {
  /** Orca Scan internal row identifier */
  _id: string
  /** The scanned barcode value — maps to UPC/EAN */
  barcode?: string
  /** Human-readable item name */
  name?: string
  /** Quantity on hand for this row */
  quantity?: number | string
  /** Free-text description */
  description?: string
  /** ISO-8601 date when the row was last scanned/updated */
  date?: string
  /** Location label within the sheet */
  location?: string
  /** Sheet (location) id this row belongs to — injected by client */
  _sheetId?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawOrcaScanRow): Product {
  const barcode = pickStr(raw.barcode)
  const qty = pickNum(raw.quantity)

  return {
    id: raw._id,
    externalId: raw._id,
    sku: barcode ?? raw._id,
    name: pickStr(raw.name) ?? barcode ?? raw._id,
    description: pickStr(raw.description),
    upc: barcode,
    brand: undefined,
    category: undefined,
    unitOfMeasure: 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    // Orca Scan does not store monetary prices — omit retailPrice
    retailPrice: undefined,
    isActive: true,
    parentProductId: undefined,
    supplierIds: [],
    createdAt: undefined,
    updatedAt: toIso(raw.date),
    platform: 'orca-scan',
    metadata: strMap({
      sheetId: raw._sheetId,
      location: raw.location,
      quantity: qty !== undefined ? String(qty) : undefined,
    }),
    raw,
  }
}
