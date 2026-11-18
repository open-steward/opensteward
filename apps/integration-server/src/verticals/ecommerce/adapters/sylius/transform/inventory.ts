/**
 * Sylius inventory -> canonical InventoryLevel.
 *
 * Sylius tracks inventory directly on product variants:
 *  - `tracked: true/false` — whether inventory is managed
 *  - `onHand` — physical stock on hand
 *  - `onHold` — reserved for open orders
 *  - Available = onHand - onHold
 *
 * Since Sylius doesn't have separate stock items or locations in the
 * default setup, we synthesize a single inventory level per variant.
 * The locationId defaults to "default".
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawSyliusInventoryEntry {
  id?: number | string
  code: string
  tracked?: boolean
  onHand?: number
  onHold?: number
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawSyliusInventoryEntry): InventoryLevel {
  const onHand = raw.onHand ?? 0
  const onHold = raw.onHold ?? 0
  return {
    id: `${raw.code}:default`,
    variantId: raw.code,
    locationId: 'default',
    available: onHand - onHold,
    committed: onHold > 0 ? onHold : undefined,
    onHand: onHand > 0 ? onHand : undefined,
    updatedAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
