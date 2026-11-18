/**
 * Pinduoduo SKU stock → canonical InventoryLevel.
 *
 * The PDD stock query API (`pdd.goods.sku.stock.query`) returns stock levels
 * per SKU. PDD does not expose multi-warehouse granularity for standard sellers
 * via this API, so a synthetic `pdd-default` location id is used.
 *
 * For enterprise sellers with warehouse management (WMS), PDD may return
 * additional warehouse fields — these are preserved in `metadata`.
 *
 * Inventory id: `${sku_id}:pdd-default` (synthetic composite).
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { unixToIso } from './product'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawPddSkuStock {
  /** PDD SKU identifier. */
  sku_id?: string | number
  /** Seller-defined outer SKU identifier. */
  outer_id?: string
  /** Goods ID this SKU belongs to. */
  goods_id?: string | number
  /** Total available (sellable) stock quantity. */
  sku_quantity?: number
  /** Reserved quantity locked for pending orders. */
  lock_quantity?: number
  /** Incoming stock (e.g. from supplier transfer). */
  incoming_quantity?: number
  /** Total on-hand (physical stock = available + committed). */
  total_quantity?: number
  /** Last-modified timestamp (Unix seconds). */
  update_time?: number
  /** Warehouse / storage location ID, if multi-warehouse is enabled. */
  warehouse_id?: string | number
  [key: string]: unknown
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_LOCATION_ID = 'pdd-default'

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * PDD SKU stock record → canonical InventoryLevel.
 *
 * The `variantId` is the PDD `sku_id`. The `available` stock is the
 * sellable `sku_quantity`. `lock_quantity` maps to `committed` (reserved
 * for open orders that have not yet shipped).
 */
export function transformInventoryLevel(raw: RawPddSkuStock): InventoryLevel {
  const variantId = String(raw.sku_id ?? raw.outer_id ?? '')
  const locationId = raw.warehouse_id ? String(raw.warehouse_id) : DEFAULT_LOCATION_ID

  const available = raw.sku_quantity ?? 0
  const committed = raw.lock_quantity ?? undefined
  const incoming = raw.incoming_quantity ?? undefined
  const onHand =
    raw.total_quantity != null
      ? raw.total_quantity
      : committed != null
        ? available + committed
        : undefined

  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    committed,
    incoming,
    onHand,
    updatedAt: unixToIso(raw.update_time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Transform a list of PDD SKU stock records.
 */
export function transformInventoryLevels(
  rawList: RawPddSkuStock[] | undefined,
): InventoryLevel[] {
  if (!rawList || rawList.length === 0) return []
  return rawList.map(transformInventoryLevel)
}
