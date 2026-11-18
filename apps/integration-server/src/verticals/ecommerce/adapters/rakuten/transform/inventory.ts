/**
 * Rakuten RMS inventory → canonical InventoryLevel.
 *
 * Rakuten inventory is tracked at the item level via the RMS API.
 * Key fields:
 *
 *   - `normalInventoryStock` — normal (non-ordered) stock count
 *   - `remainingCount`       — remaining sellable stock (may be null when
 *                              inventory mode is "unlimited")
 *   - `inventoryType`        — 0 = no management, 1 = managed, 2 = orders
 *
 * Since Rakuten does not expose warehouse locations, we use
 * `rakuten-default` as a synthetic location id.
 *
 * The synthesised inventory level id is `${itemUrl}:${DEFAULT_LOCATION_ID}`.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { DEFAULT_LOCATION_ID } from '../constants'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RakutenInventoryItem {
  /** Item URL (unique item identifier) */
  itemUrl: string
  /** Sellable (remaining) stock; null when inventory is unmanaged */
  remainingCount?: number | null
  /** Normal stock count from the RMS item record */
  normalInventoryStock?: number
  /** Ordered (committed) count */
  orderedCount?: number
  /**
   * Inventory type:
   *   0 = no management (unlimited)
   *   1 = managed quantity
   *   2 = disable on order
   */
  inventoryType?: number
  /** Last update datetime (ISO string) */
  updateDatetime?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformInventoryLevel(raw: RakutenInventoryItem): InventoryLevel {
  // When remainingCount is null, inventory is "unmanaged" — represent as 0
  const available = raw.remainingCount ?? raw.normalInventoryStock ?? 0
  const committed = raw.orderedCount

  return {
    id: `${raw.itemUrl}:${DEFAULT_LOCATION_ID}`,
    variantId: raw.itemUrl,
    locationId: DEFAULT_LOCATION_ID,
    available,
    committed,
    onHand:
      committed != null ? available + committed : undefined,
    updatedAt: raw.updateDatetime ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
