/**
 * Sharetribe stockAdjustment → canonical InventoryLevel.
 *
 * Sharetribe tracks inventory at the listing level via the
 * `stockAdjustment` resource (Integration API endpoints:
 * `/stock_adjustments/query` and `/stock_adjustments/create`).
 *
 * There is no multi-location concept in Sharetribe; stock is tied to a
 * single listing. We therefore synthesize:
 *   variantId  = listing UUID (listings are single-SKU)
 *   locationId = "listing:<listingUUID>"  (virtual, no warehouse concept)
 *   id         = "<variantId>:<locationId>"
 *
 * The `quantity` field on a stockAdjustment represents a delta (positive =
 * increase, negative = decrease). When querying adjustments we sum all
 * deltas per listing to produce the `available` total. The `/stock/compare_and_set`
 * endpoint reads/writes the absolute value but is not surfaced here (it is
 * the write path used by setInventoryLevel).
 *
 * Docs: https://www.sharetribe.com/api-reference/integration.html#stock-adjustments
 */

import type { InventoryLevel } from '../../../schema/inventory'
import type { SharetribeUUID } from './product'

// ── Raw Sharetribe shapes ─────────────────────────────────────────────────────

export interface RawSharetribeStockAdjustment {
  id: SharetribeUUID
  type: 'stockAdjustment'
  attributes: {
    /** Positive = stock added; negative = stock removed. */
    quantity: number
    createdAt?: string
  }
  relationships?: {
    listing?: { data?: SharetribeUUID }
    stockReservation?: { data?: SharetribeUUID | null }
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Transform a single Sharetribe stockAdjustment into a canonical InventoryLevel.
 *
 * Because each adjustment is a delta, this represents a point-in-time change
 * event rather than a running total. Callers that need the live total should
 * use `aggregateInventoryLevels` instead.
 */
export function transformStockAdjustment(raw: RawSharetribeStockAdjustment): InventoryLevel {
  const id = raw.id?.uuid ?? String(raw.id)
  const listingId = raw.relationships?.listing?.data?.uuid ?? id
  const locationId = `listing:${listingId}`
  const syntheticId = `${listingId}:${locationId}`

  return {
    id: syntheticId,
    variantId: listingId,
    locationId,
    available: Math.max(0, raw.attributes.quantity),
    updatedAt: raw.attributes.createdAt,
    metadata: {
      adjustmentId: id,
      rawQuantityDelta: raw.attributes.quantity,
      stockReservationId: raw.relationships?.stockReservation?.data?.uuid ?? null,
    } as Record<string, unknown>,
  }
}

/**
 * Aggregate a list of stock adjustments for a single listing into one
 * canonical InventoryLevel representing the current total available stock.
 */
export function aggregateInventoryLevels(
  adjustments: RawSharetribeStockAdjustment[],
  listingId: string,
): InventoryLevel {
  const locationId = `listing:${listingId}`
  const syntheticId = `${listingId}:${locationId}`

  const total = adjustments.reduce((sum, adj) => sum + (adj.attributes.quantity ?? 0), 0)
  const available = Math.max(0, total)

  const latest = adjustments.reduce<RawSharetribeStockAdjustment | undefined>((acc, adj) => {
    if (!acc || (adj.attributes.createdAt ?? '') > (acc.attributes.createdAt ?? '')) return adj
    return acc
  }, undefined)

  return {
    id: syntheticId,
    variantId: listingId,
    locationId,
    available,
    updatedAt: latest?.attributes.createdAt,
    metadata: {
      adjustmentCount: adjustments.length,
      rawTotal: total,
    } as Record<string, unknown>,
  }
}
