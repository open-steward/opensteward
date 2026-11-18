/**
 * commercetools InventoryEntry → canonical InventoryLevel.
 *
 * commercetools tracks stock as independent `/inventory` records keyed
 * by (sku, supplyChannel). Since the canonical schema uses
 * `variantId + locationId` the transform substitutes the sku for
 * variantId (there is no direct variant pointer on the inventory entry)
 * and falls back to `'default'` for the location when no supply channel
 * is attached.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawCtInventoryEntry {
  id: string
  version?: number
  sku: string
  supplyChannel?: { id: string; typeId: 'channel' }
  quantityOnStock: number
  availableQuantity?: number
  restockableInDays?: number
  expectedDelivery?: string
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawCtInventoryEntry): InventoryLevel {
  const locationId = raw.supplyChannel?.id ?? 'default'
  return {
    id: raw.id,
    variantId: raw.sku,
    locationId,
    available: raw.availableQuantity ?? raw.quantityOnStock,
    onHand: raw.quantityOnStock,
    updatedAt: raw.lastModifiedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build a commercetools `InventoryEntryDraft` body from a canonical
 * InventoryLevel. commercetools keys stock on sku + supplyChannel, so
 * the canonical `variantId` must be the sku string.
 */
export function untransformInventoryLevel(
  level: Partial<InventoryLevel>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    sku: level.variantId,
    quantityOnStock: level.available,
  }
  if (level.locationId && level.locationId !== 'default') {
    body['supplyChannel'] = { typeId: 'channel', id: level.locationId }
  }
  return body
}
