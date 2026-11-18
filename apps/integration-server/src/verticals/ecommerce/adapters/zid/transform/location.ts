/**
 * Zid Location → canonical Location.
 *
 * Zid surfaces location names as strings in product stock objects. There is
 * no dedicated /locations endpoint in the documented Merchant API; the store
 * itself acts as a single location. We model the stock location slug as the
 * Location id.
 */

import type { Location } from '../../../schema/location'

export interface RawZidLocation {
  /** Location slug or identifier as returned in product.stocks[*].location */
  id?: number | string
  name?: string
  slug?: string
  address?: string | null
  [key: string]: unknown
}

export function transformLocation(raw: RawZidLocation): Location {
  return {
    id: String(raw.id ?? raw.slug ?? raw.name ?? ''),
    name: raw.name ?? String(raw.id ?? ''),
    active: true,
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
