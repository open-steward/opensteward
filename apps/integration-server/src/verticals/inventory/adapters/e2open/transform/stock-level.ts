/**
 * Transform E2open CDM Inventory transaction records into canonical StockLevel.
 *
 * E2open reports inventory positions as CDM Inventory entity records.
 * Each record represents the quantity at a (SKU, location) intersection.
 *
 * CDM Inventory fields:
 *   partnerSkuCode   — SKU identifier
 *   validatedSkuCode — e2open-canonical SKU
 *   locationId       — warehouse / location identifier
 *   locationName     — human-readable location name
 *   quantity1        — quantity on hand (primary quantity field)
 *   availableQty     — available (uncommitted) quantity
 *   allocatedQty     — committed / allocated quantity
 *   inTransitQty     — quantity in transit / incoming
 *   reorderPoint     — reorder trigger level
 *   reorderQty       — standard reorder quantity
 *   transactionDate  — date of last inventory update
 *   partnerCode      — partner identifier
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawE2openStockLevel {
  id?: string
  partnerSkuCode?: string
  validatedSkuCode?: string
  locationId?: string
  locationName?: string
  quantity1?: number | string
  availableQty?: number | string
  allocatedQty?: number | string
  inTransitQty?: number | string
  reorderPoint?: number | string
  reorderQty?: number | string
  transactionDate?: string
  partnerCode?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawE2openStockLevel): StockLevel {
  const productId  = pickStr(raw.partnerSkuCode) ?? pickStr(raw.validatedSkuCode) ?? pickStr(raw.id) ?? ''
  const locationId = pickStr(raw.locationId) ?? ''

  return {
    id:                 `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand:     pickNum(raw.quantity1)    ?? 0,
    quantityAvailable:  pickNum(raw.availableQty),
    quantityCommitted:  pickNum(raw.allocatedQty),
    quantityIncoming:   pickNum(raw.inTransitQty),
    reorderPoint:       pickNum(raw.reorderPoint),
    reorderQuantity:    pickNum(raw.reorderQty),
    lastCountedAt:      toIso(raw.transactionDate),
    platform:           'e2open',
    metadata:           strMap({
      locationName:     raw.locationName,
      partnerCode:      raw.partnerCode,
      validatedSkuCode: raw.validatedSkuCode,
    }),
    raw,
  }
}
