/**
 * Transform Infor WMS inventory balance records.
 *
 * Infor WMS exposes inventory balances at /WMS/inventorybalances.
 * The community-documented endpoint is /{warehouse}/inventorybalance/showinventorybalancelist.
 * Key fields in the response:
 *   itemNumber      — item identifier
 *   warehouseId     — warehouse / facility code (used as locationId)
 *   locationId      — bin/slot location within the warehouse
 *   onHandQty       — quantity physically present
 *   availableQty    — on-hand minus allocated
 *   allocatedQty    — quantity committed to outbound orders
 *   incomingQty     — quantity on open inbound orders
 *   reorderPoint    — minimum stock trigger
 *   reorderQty      — replenishment quantity
 *   lastCountDate   — date of last physical count
 *   lotNumber       — lot (if lot-controlled)
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

export interface RawInforWmsInventoryBalance {
  itemNumber: string
  warehouseId?: string
  locationId?: string
  onHandQty?: number | string
  availableQty?: number | string
  allocatedQty?: number | string
  incomingQty?: number | string
  reorderPoint?: number | string
  reorderQty?: number | string
  lastCountDate?: string
  lotNumber?: string
  uom?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawInforWmsInventoryBalance): StockLevel {
  // Composite location: prefer the bin-level locationId, fall back to warehouse.
  const locationId = raw.locationId ?? raw.warehouseId ?? ''
  return {
    id: `${raw.itemNumber}:${locationId}`,
    productId: raw.itemNumber,
    locationId,
    quantityOnHand: pickNum(raw.onHandQty) ?? 0,
    quantityAvailable: pickNum(raw.availableQty),
    quantityCommitted: pickNum(raw.allocatedQty),
    quantityIncoming: pickNum(raw.incomingQty),
    reorderPoint: pickNum(raw.reorderPoint),
    reorderQuantity: pickNum(raw.reorderQty),
    lastCountedAt: toIso(raw.lastCountDate),
    platform: 'infor-wms',
    metadata: strMap({
      warehouseId: raw.warehouseId,
      lotNumber: raw.lotNumber,
      uom: raw.uom,
    }),
    raw,
  }
}
