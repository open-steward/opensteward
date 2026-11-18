import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

/**
 * OpenBoxes inventory item (stock level) returned from:
 *   GET /openboxes/api/generic/inventoryItem
 *   GET /openboxes/api/products/:id/availableItems
 *
 * Response envelope: { data: RawOpenboxesStockLevel[] }
 *
 * OpenBoxes tracks inventory at the inventoryItem level (product + lotNumber
 * + location). We synthesise a composite id from product+location.
 */
export interface RawOpenboxesStockLevel {
  id: string
  product?: { id?: string; productCode?: string; name?: string } | null
  inventoryItem?: { id?: string; lotNumber?: string; expirationDate?: string } | null
  location?: { id?: string; name?: string } | null
  /** quantityAvailable is the primary on-hand quantity field */
  quantityAvailable?: number | null
  quantityOnHand?: number | null
  quantity?: number | null
  [key: string]: unknown
}

export function transformStockLevel(raw: RawOpenboxesStockLevel): StockLevel {
  const productId = raw.product?.id ?? ''
  const locationId = raw.location?.id ?? ''
  const onHand = raw.quantityOnHand ?? raw.quantityAvailable ?? raw.quantity ?? 0
  return {
    id: `${productId}:${locationId}:${raw.id}`,
    productId,
    locationId,
    quantityOnHand: onHand,
    quantityAvailable: raw.quantityAvailable ?? undefined,
    lastCountedAt: toIso(raw.inventoryItem?.expirationDate),
    platform: 'openboxes',
    metadata: strMap({
      inventoryItemId: raw.inventoryItem?.id,
      lotNumber: raw.inventoryItem?.lotNumber,
    }),
    raw,
  }
}
