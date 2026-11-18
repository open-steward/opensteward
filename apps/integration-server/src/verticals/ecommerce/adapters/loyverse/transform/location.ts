/**
 * Loyverse Store → canonical Location.
 *
 * Loyverse's concept of a physical location is a "store". Each store has an
 * `id`, `name`, and flat address fields (`address`, `city`, `state`,
 * `postal_code`, `country`). Stores returned from the API are active by
 * definition (deleted stores are omitted).
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawLoyverseStore {
  id: string
  name: string
  address?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
  phone_number?: string | null
  description?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  [key: string]: unknown
}

function mapAddress(raw: RawLoyverseStore): Address | undefined {
  const line1 = raw.address ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.postal_code ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region, postalCode, country }
}

export function transformLocation(raw: RawLoyverseStore): Location {
  return {
    id: raw.id,
    name: raw.name,
    active: raw.deleted_at == null,
    address: mapAddress(raw),
    phone: raw.phone_number ?? undefined,
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
