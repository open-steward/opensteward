/**
 * Revel Establishment → canonical Location.
 *
 * In Revel, each establishment is a location, listed at
 * `/enterprise/Establishment/` and read one at a time at
 * `/enterprise/Establishment/{EstablishmentId}/` (general_suite.yaml, 2025.3.0).
 * The documented row's `address` is not an address but "URI of an Address
 * resource where the location address is defined" (example
 * "/enterprise/Address/2009/"), and the row has no city, state, zipcode or
 * country of its own. A URI is not mapped onto a street line: it stays in
 * `metadata`, and the location has no address unless the row carries one.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawRevelEstablishment {
  id: number
  name?: string
  /** Documented as the URI of an Address resource; a plain street line is kept. */
  address?: string
  city?: string
  state?: string
  zipcode?: string
  country?: string
  phone?: string
  active?: boolean
  [key: string]: unknown
}

/** A Revel resource URI (`/enterprise/Address/2009/`), not text. */
function isResourceUri(value: string): boolean {
  return /^\/[A-Za-z]+\/[A-Za-z]+\/\d+\/?$/.test(value.trim())
}

function mapAddress(raw: RawRevelEstablishment): Address | undefined {
  const line1 = raw.address && !isResourceUri(raw.address) ? raw.address : undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region, postalCode, country }
}

export function transformLocation(raw: RawRevelEstablishment): Location {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    active: raw.active ?? true,
    address: mapAddress(raw),
    phone: raw.phone ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
