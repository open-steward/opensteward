/**
 * Thirty Bees Location → canonical Location.
 *
 * Thirty Bees (PrestaShop 1.6 fork) does not expose a native multi-location
 * concept via its webservice API. The store itself represents a single
 * location. This transform provides a synthetic single-location record built
 * from the store's base URL so that callers receive a stable `loc_default`
 * entry rather than an empty list.
 */

import type { Location } from '../../../schema/location'

// ── Raw synthetic shape ─────────────────────────────────────────────────────

export interface RawThirtyBeesStoreInfo {
  /** The store's root URL (e.g. `https://shop.example.com`). */
  baseUrl: string
  /** Optional store name from `/api/shops/{id}`. */
  name?: string
  active?: boolean
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformLocation(raw: RawThirtyBeesStoreInfo): Location {
  return {
    id: 'loc_default',
    name: raw.name ?? raw.baseUrl,
    active: raw.active ?? true,
    isFulfillmentCenter: true,
    metadata: {
      synthetic: true,
      reason: 'Thirty Bees has no native multi-location API',
      baseUrl: raw.baseUrl,
    } as Record<string, unknown>,
  }
}
