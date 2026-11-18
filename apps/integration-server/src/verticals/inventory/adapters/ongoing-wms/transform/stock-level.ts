/**
 * Transform Ongoing WMS article + inventoryInfo → canonical StockLevel.
 *
 * The goods owner REST API returns inventory per article (not per location
 * bin). GET /articles includes an inventoryInfo sub-object with aggregate
 * quantities. A separate GET /articleItems endpoint has per-location detail
 * but is treated as a separate concern.
 *
 * For GET /articles responses the shape is the same as RawOngoingWmsArticle
 * from product.ts; here we import a minimal view sufficient for stock levels.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

interface RawInventoryInfo {
  numberOfItems?: number
  sellableNumberOfItems?: number
  numberOfBookedItems?: number
  allocatedNumberOfItems?: number
  toReceiveNumberOfItems?: number
  numberOfLockedItems?: number
  lastInDate?: string
}

export interface RawOngoingWmsStockLevel {
  articleSystemId?: number
  articleNumber?: string
  inventoryInfo?: RawInventoryInfo
  /** goodsOwnerId injected by the client for keying */
  goodsOwnerId?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawOngoingWmsStockLevel): StockLevel {
  const articleId = String(raw.articleSystemId ?? raw.articleNumber ?? '')
  const inv = raw.inventoryInfo ?? {}

  return {
    id: articleId,
    productId: articleId,
    locationId: String(raw.goodsOwnerId ?? ''),
    quantityOnHand: inv.numberOfItems ?? 0,
    quantityAvailable: inv.sellableNumberOfItems,
    quantityCommitted: inv.allocatedNumberOfItems ?? inv.numberOfBookedItems,
    quantityIncoming: inv.toReceiveNumberOfItems,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: toIso(inv.lastInDate),
    platform: 'ongoing-wms',
    metadata: strMap({
      numberOfLockedItems: inv.numberOfLockedItems,
      goodsOwnerId: raw.goodsOwnerId,
    }),
    raw,
  }
}
