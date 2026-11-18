/**
 * Bill4Time → canonical Organization transform.
 *
 * Bill4Time does not expose a dedicated "/firm" or "/organization" REST
 * endpoint in v2; firm settings are returned by the account/settings API.
 * This transform covers the fields observable in those settings responses.
 */
import type { Organization } from '../../../schema/organization'

export interface Bill4TimeFirm {
  FirmId?: string | number
  FirmName?: string
  Address?: string
  Address2?: string
  City?: string
  State?: string
  Zip?: string
  Country?: string
  Phone?: string
  Email?: string
  Website?: string
  Currency?: string
  TimeZone?: string
  [key: string]: unknown
}

export function transformOrganization(raw: Bill4TimeFirm): Organization {
  return {
    id: raw.FirmId != null ? String(raw.FirmId) : undefined,
    name: raw.FirmName || undefined,
    legalName: raw.FirmName || undefined,
    currency: raw.Currency || undefined,
    timezone: raw.TimeZone || undefined,
    website: raw.Website || undefined,
    address: {
      address1: raw.Address || undefined,
      address2: raw.Address2 || undefined,
      city: raw.City || undefined,
      region: raw.State || undefined,
      postalCode: raw.Zip || undefined,
      country: raw.Country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
