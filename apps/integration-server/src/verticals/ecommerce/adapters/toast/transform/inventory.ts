/**
 * Toast Stock API → canonical InventoryLevel.
 *
 * The Toast Stock API (/stock/v1/inventory) tracks per-menu-item stock
 * status for a restaurant. Each record carries the menu item GUID, a stock
 * status (IN_STOCK | OUT_OF_STOCK | QUANTITY), and an optional numeric
 * quantity. There is no per-location breakdown — inventory is scoped to the
 * restaurant identified by the Toast-Restaurant-External-ID header.
 *
 * Mapping decisions:
 *  - guid         → variantId   (menu item GUID acts as the variant id)
 *  - restaurantId → locationId  (passed in at call-time from client credentials)
 *  - quantity     → available   (0 for OUT_OF_STOCK; quantity for QUANTITY status)
 *  - id           → `${guid}:${restaurantId}` (synthesised composite key)
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw shape ────────────────────────────────────────────────────────────────

export interface RawToastInventoryItem {
  guid: string
  status?: 'IN_STOCK' | 'OUT_OF_STOCK' | 'QUANTITY' | string
  quantity?: number | null
  multiLocationId?: string
  versionId?: string
  /** Present only in /inventory/search responses. */
  itemGuidValidity?: string
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformInventoryLevel(
  raw: RawToastInventoryItem,
  restaurantId: string,
): InventoryLevel {
  // Resolve available stock from status / quantity fields
  let available = 0
  if (raw.status === 'IN_STOCK') {
    // In-stock items have no explicit quantity; treat as non-zero stock
    // Use null-ish quantity or fall back to a sentinel of 1 to signal
    // availability (canonical schema requires int >= 0).
    available = typeof raw.quantity === 'number' && raw.quantity > 0 ? Math.floor(raw.quantity) : 1
  } else if (raw.status === 'QUANTITY') {
    available = typeof raw.quantity === 'number' ? Math.max(0, Math.floor(raw.quantity)) : 0
  } else {
    // OUT_OF_STOCK or unknown
    available = 0
  }

  return {
    id: `${raw.guid}:${restaurantId}`,
    variantId: raw.guid,
    locationId: restaurantId,
    available,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
