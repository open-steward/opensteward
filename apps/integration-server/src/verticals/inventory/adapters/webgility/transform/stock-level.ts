/**
 * Webgility Connect stock-level transform.
 *
 * Webgility does not expose a dedicated stock-level endpoint. Instead, the
 * Items API returns QBQtyOnHand per item (synced from QuickBooks). We derive
 * a synthetic StockLevel record from each Item that has TrackInventory=true.
 *
 * A virtual locationId of "default" is used because no warehouse breakdown
 * is available from this endpoint.
 *
 * Ref: https://github.com/webgility/connect-v1.0/wiki/Items-API
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'
import type { RawWebgilityItem } from './product'

export function transformStockLevel(raw: RawWebgilityItem): StockLevel {
  const locationId = 'default'
  return {
    id: `${raw.ItemId}:${locationId}`,
    externalId: raw.ItemId,
    productId: raw.ItemId,
    locationId,
    quantityOnHand: raw.QBQtyOnHand ?? 0,
    quantityAvailable: undefined,
    quantityCommitted: undefined,
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'webgility',
    metadata: strMap({ trackInventory: raw.TrackInventory }),
    raw,
  }
}
