/**
 * Transform SOS Inventory v2 item response into the canonical Product schema.
 *
 * SOS Inventory item fields (from GET /api/v2/item):
 *   id, name, fullname, description, sku, barcode, type, category,
 *   weight, weightUnit, vendor.{id,name}, salesPrice, purchaseCost,
 *   archived, serialTracking, lotTracking, reorderPoint, leadTime,
 *   syncToken, customFields, lastSync
 *
 * salesPrice is in the platform's native currency (USD typical) and is stored
 * as a float major-unit value; the Product schema accepts it that way since
 * it is a display price, not a settled amount.
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

export interface RawSosInventoryItem {
  id: number | string
  name?: string
  fullname?: string
  description?: string
  sku?: string
  barcode?: string
  type?: string
  category?: string
  weight?: number
  weightUnit?: string
  volume?: number
  volumeUnit?: string
  vendor?: { id?: number | string; name?: string }
  salesPrice?: number
  purchaseCost?: number
  reorderPoint?: number
  maxStock?: number
  leadTime?: number
  archived?: boolean
  serialTracking?: boolean
  lotTracking?: boolean
  summaryOnly?: boolean
  syncToken?: number
  lastSync?: string
  customFields?: unknown
  tags?: string
  notes?: string
  bin?: string
  class?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawSosInventoryItem): Product {
  const id = String(raw.id)
  const vendorId = raw.vendor?.id !== undefined ? String(raw.vendor.id) : undefined

  return {
    id,
    externalId: id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.name) ?? pickStr(raw.fullname) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.barcode),
    brand: undefined,
    category: pickStr(raw.category),
    unitOfMeasure: pickStr(raw.weightUnit) ?? 'each',
    weightGrams: (() => {
      if (raw.weight === undefined) return undefined
      switch (raw.weightUnit) {
        case 'g': return raw.weight
        case 'oz': return raw.weight * 28.3495
        case 'lb': return raw.weight * 453.592
        case 'kg': return raw.weight * 1000
        // Unknown unit: treat as pounds (SOS Inventory default)
        default: return raw.weight * 453.592
      }
    })(),
    retailPrice:
      raw.salesPrice !== undefined
        ? { amount: raw.salesPrice, currency: 'USD' }
        : undefined,
    isActive: raw.archived !== undefined ? !raw.archived : true,
    parentProductId: undefined,
    supplierIds: vendorId ? [vendorId] : [],
    createdAt: undefined,
    updatedAt: toIso(raw.lastSync),
    platform: 'sos-inventory',
    metadata: strMap({
      type: raw.type,
      tags: raw.tags,
      bin: raw.bin,
      class: raw.class,
      serialTracking: raw.serialTracking,
      lotTracking: raw.lotTracking,
    }),
    raw,
  }
}
