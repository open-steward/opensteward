/**
 * Lightspeed Retail (X-Series) outlet (location) transform.
 *
 * API endpoint: GET /api/2.0/outlets
 * Docs: https://x-series-api.lightspeedhq.com/reference/listoutlets
 *
 * Key fields:
 *   id              — UUID
 *   name            — display name
 *   time_zone       — IANA time-zone string
 *   currency        — ISO 4217 currency code
 *   currency_symbol — display symbol
 *   default_tax_id  — UUID of the default tax
 *   physical_address — address sub-object
 *   version         — monotonic cursor value
 *   deleted_at      — ISO datetime if deleted, else null
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawLightspeedOutlet {
  id: string
  name?: string
  time_zone?: string
  currency?: string
  currency_symbol?: string
  default_tax_id?: string
  physical_address?: {
    city?: string
    country_subdivision_name?: string
    country_name?: string
    postcode?: string
    street_1?: string
    street_2?: string
  }
  deleted_at?: string | null
  version?: number
  [key: string]: unknown
}

export function transformLocation(raw: RawLightspeedOutlet): Location {
  const addr = raw.physical_address
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    code: undefined, // X-Series outlets have no short code field
    type: 'store',
    parentLocationId: undefined,
    address: addr ? {
      line1: pickStr(addr.street_1),
      line2: pickStr(addr.street_2),
      city: pickStr(addr.city),
      region: pickStr(addr.country_subdivision_name),
      country: pickStr(addr.country_name),
      postalCode: pickStr(addr.postcode),
    } : undefined,
    isActive: !raw.deleted_at,
    platform: 'lightspeed-inventory',
    metadata: strMap({
      timeZone: raw.time_zone,
      currency: raw.currency,
      currencySymbol: raw.currency_symbol,
      defaultTaxId: raw.default_tax_id,
    }),
    raw,
  }
}
