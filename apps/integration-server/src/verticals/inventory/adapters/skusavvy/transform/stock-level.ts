import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

/**
 * SKUSavvy GraphQL bin-level inventory node.
 * Represents stock for one product variant at one bin/location.
 */
export interface RawSkusavvyStockLevel {
  id: string
  productId: string
  locationId?: string
  binId?: string
  quantity?: number
  available?: number
  committed?: number
  incoming?: number
  reorderPoint?: number
  reorderQuantity?: number
  lastCountedAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSkusavvyStockLevel): StockLevel {
  const locationId = raw.locationId ?? raw.binId ?? ''
  return {
    id: raw.id,
    productId: raw.productId,
    locationId,
    quantityOnHand: raw.quantity ?? 0,
    quantityAvailable: raw.available,
    quantityCommitted: raw.committed,
    quantityIncoming: raw.incoming,
    reorderPoint: raw.reorderPoint,
    reorderQuantity: raw.reorderQuantity,
    lastCountedAt: toIso(raw.lastCountedAt) ?? toIso(raw.updatedAt),
    platform: 'skusavvy',
    metadata: strMap({ binId: raw.binId }),
    raw,
  }
}
