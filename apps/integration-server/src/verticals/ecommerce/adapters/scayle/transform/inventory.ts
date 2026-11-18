/**
 * SCAYLE ProductVariantStock → canonical InventoryLevel.
 *
 * SCAYLE exposes variant-level stock records per warehouse via
 * `GET /variants/{variantId}/stocks`. Each record has:
 *  - quantity (int — physical on-hand count),
 *  - warehouseReferenceKey (identifies the location),
 *  - changedAt (ISO timestamp),
 *  - sellableWithoutStock (boolean).
 *
 * There is no stable primary key on a stock record, so we synthesise one as
 * `${variantId}:${warehouseReferenceKey}`.
 *
 * Docs: https://scayle.dev/en/api-guides/admin-api
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw SCAYLE shapes (minimal) ──────────────────────────────────────────────

export interface RawScayleVariantStock {
  quantity?: number | null
  warehouseReferenceKey?: string | null
  changedAt?: string | null
  sellableWithoutStock?: boolean
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformInventoryLevel(
  raw: RawScayleVariantStock,
  variantId: string,
): InventoryLevel {
  const locationId = raw.warehouseReferenceKey ?? 'default'
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: raw.quantity ?? 0,
    onHand: raw.quantity ?? 0,
    updatedAt: raw.changedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
