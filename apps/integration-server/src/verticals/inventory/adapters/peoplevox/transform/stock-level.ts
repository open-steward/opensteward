/**
 * Transform a Peoplevox inventory row into a canonical StockLevel.
 *
 * The Export Inventory operation returns per-site inventory keyed by ItemCode.
 * Fields (from the InventoryItem/InventorySite export structure):
 *   ItemCode, ItemName, TotalOnHand, TotalAvailable, TotalAllocated (aggregate)
 *   Site fields per site: Name (site name), Reference (site code),
 *     OnHand, Available, Allocated
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap} from './shared'

export interface RawPeoplevoxInventorySite {
  /** ItemCode from parent InventoryItem */
  ItemCode: string
  /** Site name (used as locationId when Reference absent) */
  SiteName?: string
  /** Site reference/code — preferred locationId */
  SiteReference?: string
  OnHand?: string
  Available?: string
  Allocated?: string
  POQuantityOutstanding?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawPeoplevoxInventorySite): StockLevel {
  const locationId = raw.SiteReference ?? raw.SiteName ?? 'default'
  const onHand = pickNum(raw.OnHand) ?? 0
  const available = pickNum(raw.Available)
  const allocated = pickNum(raw.Allocated)
  const incoming = pickNum(raw.POQuantityOutstanding)

  return {
    id: `${raw.ItemCode}:${locationId}`,
    productId: raw.ItemCode,
    locationId,
    quantityOnHand: onHand,
    quantityAvailable: available,
    quantityCommitted: allocated,
    quantityIncoming: incoming,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'peoplevox',
    metadata: strMap({ siteName: raw.SiteName }),
    raw,
  }
}
