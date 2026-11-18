/**
 * Salesforce Commerce Cloud (SCAPI) Product Inventory Record → canonical InventoryLevel.
 *
 * SCAPI's OCI (Omnichannel Inventory) / classic Product Inventory endpoints
 * expose stock quantities per product-inventory-list pair:
 *
 *   GET /inventory-lists/{inventoryListId}/product-inventory-records/{productId}
 *
 * The combination `{inventoryListId}:{productId}` forms the synthetic canonical
 * `id`. We use the product ID as `variantId` and the inventory-list ID as
 * `locationId` since SCAPI maps "sites" to inventory lists rather than
 * physical locations.
 *
 * Reference:
 *   https://developer.salesforce.com/docs/commerce/commerce-api/references/inventory-impex-inventory
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw SCAPI shapes ──────────────────────────────────────────────────────────

export interface RawScapiInventoryRecord {
  productId: string
  inventoryListId?: string
  perpetual?: boolean
  allocation?: number | null
  ats?: number | null           // Available To Sell
  inStockDate?: string | null
  onOrder?: number | null
  preorderable?: boolean
  backordered?: boolean
  backorderAllocation?: number | null
  reserved?: number | null
  turnover?: number | null
  stockOnHand?: number | null
  updatedAt?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformInventoryLevel(raw: RawScapiInventoryRecord): InventoryLevel {
  const productId = raw.productId
  const locationId = raw.inventoryListId ?? 'default'

  // SCAPI ATS (Available To Sell) maps most directly to the canonical
  // `available` field.  For perpetual items, report a large sentinel value.
  let available: number
  if (raw.perpetual === true) {
    available = 9_999_999
  } else {
    available = raw.ats ?? raw.allocation ?? raw.stockOnHand ?? 0
    if (available < 0) available = 0
  }

  return {
    id: `${locationId}:${productId}`,
    variantId: productId,
    locationId,
    available,
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
