/**
 * Dooca Commerce Inventory → canonical InventoryLevel.
 *
 * In Dooca Commerce, stock is managed as a field on each product variation
 * (not as a separate ledger). The `balance` field on a variation holds the
 * available quantity. There is no concept of multi-location inventory.
 *
 * The canonical InventoryLevel is synthesised from a variation's balance field:
 *   - `id` → `${variationId}:default`
 *   - `variantId` → the variation id
 *   - `locationId` → 'default'
 *   - `available` → the `balance` integer
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawDoocaVariationStock {
  id: number | string
  product_id?: number | string | null
  balance?: number | null
  updated_at?: string
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawDoocaVariationStock,
  productId?: string,
): InventoryLevel {
  const variantId = String(raw.id)
  const resolvedProductId = productId ?? (raw.product_id != null ? String(raw.product_id) : undefined)
  const compositeId = resolvedProductId
    ? `${resolvedProductId}:${variantId}`
    : variantId

  return {
    id: `${compositeId}:default`,
    variantId: compositeId,
    locationId: 'default',
    available: raw.balance ?? 0,
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
