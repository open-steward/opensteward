/**
 * Alibaba.com synthetic default location → canonical Location.
 *
 * The Alibaba.com ICBU Open Platform does not expose a warehouse or
 * location management API. Inventory is tracked at the seller account
 * level with no per-warehouse granularity for standard ICBU sellers.
 *
 * To satisfy the canonical Location interface, this module produces a
 * single synthetic default location that corresponds to the `alibaba-default`
 * location id already used by the inventory transform. This is consistent
 * with the approach used throughout this adapter (the same synthetic id is
 * referenced in `transform/inventory.ts` and `constants.ts`).
 *
 * No API call is required — the location is synthesised from constants.
 */

import type { Location } from '../../../schema/location'
import { DEFAULT_LOCATION_ID } from '../constants'

// ── Synthetic location ────────────────────────────────────────────────────────

/**
 * The single synthetic location used by this adapter.
 *
 * Alibaba.com tracks inventory at the account level with no warehouse
 * granularity, so a single default location is the most accurate
 * representation of the platform's data model.
 */
export const ALIBABA_DEFAULT_LOCATION: Location = {
  id: DEFAULT_LOCATION_ID,
  name: 'Alibaba.com Default',
  active: true,
  isFulfillmentCenter: true,
  metadata: {
    synthetic: true,
    note:
      'Alibaba.com does not expose warehouse-level location data. ' +
      'This synthetic location represents the seller account-level inventory pool.',
  },
}

// ── Transform helpers ─────────────────────────────────────────────────────────

/**
 * Return the single synthetic default location for this adapter.
 */
export function getDefaultLocation(): Location {
  return ALIBABA_DEFAULT_LOCATION
}

/**
 * Return an array containing only the single synthetic default location.
 */
export function listDefaultLocations(): Location[] {
  return [ALIBABA_DEFAULT_LOCATION]
}
