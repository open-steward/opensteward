/**
 * Transform Epicor Kinetic PartWhse (PartWhseSvc/PartWhses) → canonical StockLevel.
 *
 * Key Epicor fields (REST v2 PartWhseSvc):
 *   PartNum       — part / product key
 *   WarehouseCode — warehouse identifier (maps to locationId)
 *   OnHandQty     — physical on-hand quantity
 *   NonNettable   — non-nettable quantity (excluded from available calc)
 *   ReservedQty   — quantity committed / reserved
 *   OrderedQty    — quantity on outstanding purchase orders
 *   MinimumQty    — reorder point
 *   MaximumQty    — maximum stock level (used as reorderQuantity target)
 *   SysRowID      — stable GUID row identifier
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawEpicorKineticPartWhse {
  PartNum: string
  WarehouseCode: string
  OnHandQty?: number
  NonNettable?: number
  ReservedQty?: number
  OrderedQty?: number
  MinimumQty?: number
  MaximumQty?: number
  SysRowID?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawEpicorKineticPartWhse): StockLevel {
  const locationId = raw.WarehouseCode
  const onHand     = raw.OnHandQty ?? 0
  const reserved   = raw.ReservedQty ?? 0
  // Available = onHand minus reserved (non-nettable is excluded from nettable stock)
  const available  = onHand - reserved

  return {
    id:                `${raw.PartNum}:${locationId}`,
    productId:         raw.PartNum,
    locationId,
    quantityOnHand:    onHand,
    quantityAvailable: available >= 0 ? available : undefined,
    quantityCommitted: raw.ReservedQty,
    quantityIncoming:  raw.OrderedQty,
    reorderPoint:      raw.MinimumQty,
    reorderQuantity:   raw.MaximumQty,
    lastCountedAt:     undefined,
    platform:          'epicor-kinetic',
    metadata:          strMap({
      sysRowID:     raw.SysRowID,
      nonNettable:  raw.NonNettable,
    }),
    raw,
  }
}
