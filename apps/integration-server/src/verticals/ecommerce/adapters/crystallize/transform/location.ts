/**
 * Crystallize Stock Location -> canonical Location.
 *
 * Crystallize stock locations are named locations where inventory is tracked.
 */

import type { Location } from '../../../schema/location'

export interface RawCrystallizeStockLocation {
  identifier: string
  name: string
  settings?: {
    minimum?: number
  } | null
  [key: string]: unknown
}

export function transformLocation(raw: RawCrystallizeStockLocation): Location {
  return {
    id: raw.identifier,
    name: raw.name,
    active: true,
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
