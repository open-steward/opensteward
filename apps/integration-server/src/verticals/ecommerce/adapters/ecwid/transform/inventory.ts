/**
 * Ecwid product/combination stock → canonical InventoryLevel.
 *
 * Ecwid has no dedicated inventory ledger — stock is tracked via
 * `quantity` on each product or combination. The synthetic `default`
 * location id mirrors `syntheticDefaultLocation()`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawEcwidProductStock {
  id: number | string
  quantity?: number | null
  unlimited?: boolean
  inStock?: boolean
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawEcwidProductStock,
  productId: string,
): InventoryLevel {
  const variantId = `${productId}:${raw.id}`
  return {
    id: `${variantId}:default`,
    variantId,
    locationId: 'default',
    available: raw.quantity ?? 0,
    metadata: raw as Record<string, unknown>,
  }
}
