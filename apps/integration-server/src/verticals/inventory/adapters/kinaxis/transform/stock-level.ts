/**
 * Kinaxis Maestro InventoryPolicy / OnHandInventory → StockLevel transform.
 *
 * The Maestro REST API exposes current stock through the OnHandInventory and
 * InventoryPolicy tables. Key fields:
 *   partId       — references Part.id
 *   siteId       — references Site.id (the location)
 *   onHand       — physical quantity on hand
 *   available    — available = onHand − committed
 *   committed    — quantity allocated to demand orders
 *   inTransit    — quantity on open supply orders (in-transit)
 *   reorderPoint — reorder trigger quantity (from InventoryPolicy)
 *   reorderQty   — replenishment quantity (from InventoryPolicy)
 *   lastCountDate — ISO-8601 date of last physical count
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

export interface RawKinaxisOnHandInventory {
  /** Composite key: typically "{partId}:{siteId}" or a UUID. */
  id?: string
  partId: string
  siteId?: string
  onHand?: number
  available?: number
  committed?: number
  inTransit?: number
  reorderPoint?: number
  reorderQty?: number
  lastCountDate?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawKinaxisOnHandInventory): StockLevel {
  const locationId = raw.siteId ?? ''
  const id = raw.id ?? `${raw.partId}:${locationId}`
  return {
    id,
    productId: raw.partId,
    locationId,
    quantityOnHand: raw.onHand ?? 0,
    quantityAvailable: raw.available,
    quantityCommitted: raw.committed,
    quantityIncoming: raw.inTransit,
    reorderPoint: raw.reorderPoint,
    reorderQuantity: raw.reorderQty,
    lastCountedAt: toIso(raw.lastCountDate),
    platform: 'kinaxis',
    metadata: strMap({}),
    raw,
  }
}
