/**
 * PlentyONE Stock → canonical InventoryLevel.
 *
 * PlentyONE tracks stock per variation per warehouse. Two endpoints are used
 * depending on what filters are available; they return differently-named fields:
 *
 * Per-variation endpoint (when both itemId and variationId are known):
 *   GET /rest/items/{itemId}/variations/{variationId}/stock
 *   Fields: physicalStock, netStock, reservedStock, warehouseId
 *
 * Bulk endpoint (fallback):
 *   GET /rest/stockmanagement/stock
 *   Fields: stockPhysical, stockNet, reservedStock, warehouseId, variationId
 *
 * NOTE: GET /rest/stockmanagement/stock/redistribution is a redistribution-
 * proposal endpoint and must NOT be used for stock listing.
 *
 * This transform accepts both field-name variants by coalescing them.
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw PlentyONE shapes ─────────────────────────────────────────────────────

export interface RawPlentyOneStock {
  variationId?: number | string
  warehouseId?: number | string
  /**
   * Available (net) stock.
   * Per-variation endpoint uses `netStock`; bulk endpoint uses `stockNet`.
   */
  netStock?: number | null
  stockNet?: number | null
  /**
   * Physical (on-hand) stock.
   * Per-variation endpoint uses `physicalStock`; bulk endpoint uses `stockPhysical`.
   */
  physicalStock?: number | null
  stockPhysical?: number | null
  /** Reserved stock. Both endpoints use `reservedStock`. */
  reservedStock?: number | null
  reorderLevel?: number | null
  updatedAt?: string
  [key: string]: unknown
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformStock(raw: RawPlentyOneStock): InventoryLevel {
  const variationId = String(raw.variationId ?? '')
  const warehouseId = String(raw.warehouseId ?? '')

  // Coalesce both field-name variants (per-variation vs bulk endpoint).
  const net = raw.netStock ?? raw.stockNet
  const physical = raw.physicalStock ?? raw.stockPhysical

  const available = Math.max(0, Math.round(net ?? physical ?? 0))
  const reserved = raw.reservedStock != null ? Math.max(0, Math.round(raw.reservedStock)) : undefined
  const onHand = physical != null ? Math.max(0, Math.round(physical)) : undefined

  return {
    id: `${variationId}:${warehouseId}`,
    variantId: variationId,
    locationId: warehouseId,
    available,
    committed: reserved,
    onHand,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
