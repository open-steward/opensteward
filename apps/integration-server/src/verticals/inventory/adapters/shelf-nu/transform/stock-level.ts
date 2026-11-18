/**
 * Synthesise a StockLevel from a Shelf.nu asset list entry.
 *
 * Shelf tracks individual physical items (serialised assets) rather than
 * fungible quantity counts. We synthesise a stock-level record per asset where:
 *   - quantityOnHand  = 1 (the asset exists)
 *   - quantityAvailable = 1 if status === AVAILABLE, else 0
 *   - quantityCommitted = 1 if status === IN_CUSTODY or CHECKED_OUT, else 0
 *
 * The composed id is `<assetId>:<locationId>` (locationId may be empty string
 * if the asset has no assigned location).
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

export interface RawShelfNuAssetForStock {
  id: string
  status?: string | null
  locationId?: string | null
  location?: { id: string; name: string } | null
  updatedAt?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawShelfNuAssetForStock): StockLevel {
  const locationId = raw.locationId ?? raw.location?.id ?? ''
  const status = (raw.status ?? 'AVAILABLE').toUpperCase()
  const isAvailable = status === 'AVAILABLE'
  const isCommitted = status === 'IN_CUSTODY' || status === 'CHECKED_OUT'

  return {
    id: `${raw.id}:${locationId}`,
    productId: raw.id,
    locationId,
    quantityOnHand: 1,
    quantityAvailable: isAvailable ? 1 : 0,
    quantityCommitted: isCommitted ? 1 : 0,
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: toIso(raw.updatedAt),
    platform: 'shelf-nu',
    metadata: strMap({ status }),
    raw,
  }
}
