import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

/**
 * GoCodes does not expose a dedicated stock-level endpoint.  Quantity data is
 * derived from each asset record: every physical asset is a single unit, so
 * one asset record at a location contributes quantity 1.  The caller
 * aggregates these per (asset_tag, location_id) into a synthesised stock-level
 * record of the shape below.
 *
 * If the GoCodes API later adds a dedicated quantity/inventory endpoint the
 * raw shape may change; update this interface accordingly.
 */
export interface RawGocodesStockLevel {
  /** Asset ID used as the product identifier. */
  asset_id: string
  /** Location ID this quantity belongs to. */
  location_id: string
  /** Quantity on hand at this location. */
  quantity_on_hand?: number
  /** Quantity checked out / committed. */
  quantity_checked_out?: number
  /** Date of last physical audit/count. */
  last_audit_date?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawGocodesStockLevel): StockLevel {
  return {
    id: `${raw.asset_id}:${raw.location_id}`,
    productId: String(raw.asset_id),
    locationId: String(raw.location_id),
    quantityOnHand: raw.quantity_on_hand ?? 1,
    quantityAvailable: undefined,
    quantityCommitted: raw.quantity_checked_out,
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: toIso(raw.last_audit_date),
    platform: 'gocodes',
    metadata: strMap({}),
    raw,
  }
}
