/**
 * commercetools Channel (with role InventorySupply) → canonical Location.
 *
 * commercetools has no "location" resource; merchants model physical
 * warehouses and pickup points as Channels tagged with one or more
 * roles. The canonical adapter filters to channels carrying
 * `InventorySupply` (the role used to key inventory entries).
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'
import { DEFAULT_LOCALE } from '../constants'
import { pickLocalized, type RawCtLocalizedString } from './variant'

export interface RawCtChannelAddress {
  streetName?: string
  streetNumber?: string
  additionalStreetInfo?: string
  city?: string
  region?: string
  state?: string
  postalCode?: string
  country?: string
  [key: string]: unknown
}

export interface RawCtChannel {
  id: string
  version?: number
  key: string
  roles: string[]
  name?: RawCtLocalizedString
  description?: RawCtLocalizedString
  address?: RawCtChannelAddress
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

function mapAddress(raw: RawCtChannelAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1Parts: string[] = []
  if (raw.streetName) line1Parts.push(raw.streetName)
  if (raw.streetNumber) line1Parts.push(raw.streetNumber)
  const line1 = line1Parts.length > 0 ? line1Parts.join(' ') : undefined
  const line2 = raw.additionalStreetInfo
  const city = raw.city
  const region = raw.region ?? raw.state
  const postalCode = raw.postalCode
  const country = raw.country
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformLocation(
  raw: RawCtChannel,
  locale: string = DEFAULT_LOCALE,
): Location {
  return {
    id: raw.id,
    name: pickLocalized(raw.name, locale) ?? raw.key,
    active: true,
    address: mapAddress(raw.address),
    isFulfillmentCenter: raw.roles?.includes('InventorySupply') || undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Location → commercetools `ChannelDraft` body. Always sets
 * role `InventorySupply` so the resulting channel shows up in
 * `listLocations` queries.
 */
export function untransformLocation(
  location: Partial<Location>,
  locale: string = DEFAULT_LOCALE,
): Record<string, unknown> {
  return {
    key: location.metadata?.['key'] ?? location.name?.toLowerCase().replace(/\s+/g, '-'),
    roles: ['InventorySupply'],
    name: location.name ? { [locale]: location.name } : undefined,
    address: location.address
      ? {
          streetName: location.address.line1,
          additionalStreetInfo: location.address.line2,
          city: location.address.city,
          region: location.address.region,
          postalCode: location.address.postalCode,
          country: location.address.country,
        }
      : undefined,
  }
}

/**
 * Translate canonical partial Location updates to commercetools channel
 * update actions.
 */
export function buildActionsForLocation(
  _current: RawCtChannel,
  updates: Partial<Location>,
  locale: string = DEFAULT_LOCALE,
): Array<Record<string, unknown>> {
  const actions: Array<Record<string, unknown>> = []
  if (updates.name !== undefined) {
    actions.push({ action: 'changeName', name: { [locale]: updates.name } })
  }
  if (updates.address !== undefined) {
    actions.push({
      action: 'setAddress',
      address: {
        streetName: updates.address?.line1,
        additionalStreetInfo: updates.address?.line2,
        city: updates.address?.city,
        region: updates.address?.region,
        postalCode: updates.address?.postalCode,
        country: updates.address?.country,
      },
    })
  }
  return actions
}
