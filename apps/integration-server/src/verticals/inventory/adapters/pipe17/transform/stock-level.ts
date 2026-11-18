/**
 * Pipe17 /inventory endpoint -> StockLevel schema.
 *
 * Pipe17 inventory record key fields:
 *   sku, locationId, onHand, available, committed, future,
 *   incoming, unavailable, committedFuture, integration
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickStr, strMap} from './shared'

export interface RawPipe17InventoryRecord {
  sku?: string
  locationId?: string
  onHand?: number
  available?: number
  committed?: number
  future?: number
  incoming?: number
  unavailable?: number
  committedFuture?: number
  integration?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawPipe17InventoryRecord): StockLevel {
  const sku = pickStr(raw.sku) ?? ''
  const locationId = pickStr(raw.locationId) ?? ''
  return {
    id: `${sku}:${locationId}`,
    productId: sku,
    locationId,
    quantityOnHand: raw.onHand ?? 0,
    quantityAvailable: raw.available,
    quantityCommitted: raw.committed,
    quantityIncoming: raw.incoming,
    platform: 'pipe17',
    metadata: strMap({
      future: raw.future,
      unavailable: raw.unavailable,
      committedFuture: raw.committedFuture,
      integration: raw.integration,
    }),
    raw,
  }
}
