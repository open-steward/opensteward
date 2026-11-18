/**
 * Aimeos Stock → canonical InventoryLevel / Location.
 *
 * Aimeos exposes stock data via the `stock` resource at `GET /api/stock`.
 * Stock records reference a product and a stock type (warehouse/location).
 *
 * `stock` resource attributes (dot-notation):
 *   stock.id           — id
 *   stock.productid    — FK to product
 *   stock.productcode  — product SKU
 *   stock.stocklevel   — integer stock quantity (null = unlimited)
 *   stock.type         — stock type/location code (e.g. "default", "warehouse-1")
 *   stock.backdate     — ISO date for backorder availability
 *   stock.dateback     — alias for backdate in some versions
 *   stock.ctime        — ISO datetime created
 *   stock.mtime        — ISO datetime updated
 *
 * Since Aimeos stock is per-product (not per-variant by default), we map:
 *   variantId = stock.productid
 *   locationId = stock.type (e.g. "default")
 *
 * The canonical id is synthesised as `{productId}:{stockType}` per the
 * InventoryLevel schema recommendation.
 *
 * Locations are virtual — they correspond to stock types, not physical
 * warehouse records in the REST API. We synthesise Location objects from
 * the distinct stock types we observe.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import type { Location } from '../../../schema/location'
import type { AimeosResource } from '../client'

// ── Raw Aimeos shapes ─────────────────────────────────────────────────────────

export interface AimeosStockAttributes {
  'stock.id'?: string | number
  'stock.productid'?: string | number
  'stock.productcode'?: string
  'stock.stocklevel'?: number | null
  'stock.type'?: string
  'stock.backdate'?: string | null
  'stock.dateback'?: string | null
  'stock.ctime'?: string | null
  'stock.mtime'?: string | null
  [key: string]: unknown
}

export type AimeosStock = AimeosResource & {
  attributes: AimeosStockAttributes
}

// ── Inventory level transform ─────────────────────────────────────────────────

export function transformInventoryLevel(raw: AimeosStock): InventoryLevel {
  const attrs = raw.attributes
  const productId = attrs['stock.productid'] != null
    ? String(attrs['stock.productid'])
    : raw.id
  const stockType = (attrs['stock.type'] as string | undefined) ?? 'default'
  const stockLevel = attrs['stock.stocklevel']

  // null stocklevel means unlimited stock — we represent as a large number
  const available = stockLevel == null
    ? 999999
    : typeof stockLevel === 'number'
      ? stockLevel
      : parseInt(String(stockLevel), 10) || 0

  return {
    id: `${productId}:${stockType}`,
    variantId: productId,
    locationId: stockType,
    available,
    onHand: available,
    updatedAt: attrs['stock.mtime'] ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Location transform ────────────────────────────────────────────────────────

/**
 * Synthesise a canonical Location from a distinct Aimeos stock type.
 * Aimeos does not expose a `/api/location` endpoint — locations are implicit
 * in the stock type field. We create a minimal Location from the stock record.
 */
export function transformStockLocation(raw: AimeosStock): Location {
  const attrs = raw.attributes
  const stockType = (attrs['stock.type'] as string | undefined) ?? 'default'

  return {
    id: stockType,
    name: stockType.charAt(0).toUpperCase() + stockType.slice(1).replace(/-/g, ' '),
    active: true,
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build an InventoryLevel from explicit data (when calling setInventoryLevel).
 */
export function buildInventoryLevel(data: {
  variantId: string
  locationId: string
  available: number
  raw?: AimeosResource
}): InventoryLevel {
  return {
    id: `${data.variantId}:${data.locationId}`,
    variantId: data.variantId,
    locationId: data.locationId,
    available: data.available,
    onHand: data.available,
    updatedAt: new Date().toISOString(),
    metadata: data.raw
      ? (data.raw as unknown as Record<string, unknown>)
      : {
          variantId: data.variantId,
          locationId: data.locationId,
          available: data.available,
          synthetic: true,
        },
  }
}
