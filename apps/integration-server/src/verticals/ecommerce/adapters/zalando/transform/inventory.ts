/**
 * Zalando zDirect Stock → canonical InventoryLevel.
 *
 * Zalando's Stocks API maps merchant article EANs (variants) to available
 * stock quantities. Each stock entry is keyed by EAN and optionally by
 * warehouse/location.
 *
 * Because Zalando does not expose a stable location concept via the Stocks
 * API (stock is set globally per EAN), we use a synthetic location id of
 * `'zalando-warehouse'` when no location is returned.
 *
 * Docs: https://developers.merchants.zalando.com/docs/stocks.html
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Zalando shapes ────────────────────────────────────────────────────────

export interface RawZalandoStock {
  /** EAN identifying the article variant. */
  ean: string
  /** Available stock quantity (integer). */
  available?: number | null
  /** Physical on-hand (may include reserved units). */
  on_hand?: number | null
  /** Reserved / committed for open orders. */
  reserved?: number | null
  /** Zalando warehouse location id (optional). */
  location_id?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

const DEFAULT_LOCATION_ID = 'zalando-warehouse'

export function transformInventoryLevel(raw: RawZalandoStock): InventoryLevel {
  const locationId = raw.location_id ?? DEFAULT_LOCATION_ID
  const available = raw.available ?? 0

  return {
    // Synthesise a stable id from EAN + location
    id: `${raw.ean}:${locationId}`,
    variantId: raw.ean,
    locationId,
    available,
    committed: raw.reserved ?? undefined,
    onHand: raw.on_hand ?? undefined,
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical InventoryLevel → Zalando stock request body. */
export function untransformInventoryLevel(data: {
  ean: string
  available: number
}): Record<string, unknown> {
  return {
    ean: data.ean,
    available: data.available,
  }
}
