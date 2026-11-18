/**
 * Crystallize Stock -> canonical InventoryLevel.
 *
 * Crystallize tracks stock per variant per stock location. There is no
 * stable single-field id, so we synthesize `${variantSku}:${locationIdentifier}`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawCrystallizeStock {
  sku?: string
  location?: string
  stock?: number
  /** The variant ID, passed by the adapter. */
  variantId?: string
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawCrystallizeStock,
  variantIdOverride?: string,
): InventoryLevel {
  const variantId = variantIdOverride ?? raw.variantId ?? raw.sku ?? ''
  const locationId = raw.location ?? ''
  const available = raw.stock ?? 0

  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    onHand: available,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
