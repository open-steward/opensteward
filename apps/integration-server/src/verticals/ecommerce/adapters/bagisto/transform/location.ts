/**
 * Bagisto Inventory Source → canonical Location.
 *
 * Bagisto's multi-source inventory (MSI) exposes inventory sources as
 * distinct stock locations via `/api/v1/inventory-sources`. Each source
 * has a name, code, address, and active flag.
 *
 * Docs: https://devdocs.bagisto.com/1.x/api/inventory-sources.html
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface BagistoInventorySource {
  id: number | string
  code?: string | null
  name?: string | null
  contact_name?: string | null
  contact_email?: string | null
  contact_number?: string | null
  contact_fax?: string | null
  country?: string | null
  state?: string | null
  city?: string | null
  street?: string | null
  postcode?: string | null
  priority?: number | null
  latitude?: number | null
  longitude?: number | null
  status?: boolean | number | null
  [key: string]: unknown
}

function mapAddress(raw: BagistoInventorySource): Address | undefined {
  const line1 = raw.street ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region, postalCode, country }
}

function isActive(raw: BagistoInventorySource): boolean {
  if (raw.status === undefined || raw.status === null) return true
  return raw.status === true || raw.status === 1
}

export function transformLocation(raw: BagistoInventorySource): Location {
  return {
    id: String(raw.id),
    name: raw.name ?? String(raw.id),
    active: isActive(raw),
    address: mapAddress(raw),
    phone: raw.contact_number ?? undefined,
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
