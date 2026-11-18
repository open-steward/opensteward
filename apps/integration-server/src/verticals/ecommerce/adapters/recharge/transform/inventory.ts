/**
 * Recharge does not expose a dedicated inventory ledger.
 *
 * Inventory is managed by the underlying ecommerce platform (Shopify, etc.).
 * This file exports a minimal synthetic transform used only to satisfy the
 * interface when inventory-level reads are triggered through the adapter.
 * The adapter itself does NOT implement `listInventoryLevels` /
 * `getInventoryLevel` / `adjustInventoryLevel` / `setInventoryLevel` since
 * Recharge has no inventory API surface.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawRechargeInventoryStub {
  id: number | string
  [key: string]: unknown
}

/** Build a zero-quantity synthetic inventory level for a Recharge product variant. */
export function transformInventoryLevel(raw: RawRechargeInventoryStub): InventoryLevel {
  return {
    id: `${raw.id}:default`,
    variantId: String(raw.id),
    locationId: 'default',
    available: 0,
    metadata: {
      ...raw,
      synthetic: true,
      reason: 'Recharge has no inventory API; managed by underlying ecommerce platform',
    },
  }
}
