/**
 * Soldo company → canonical Organization.
 *
 * Endpoint: GET /business/v2/company
 *
 * Company fields vary; common fields include name, currency, address details.
 */

import type { Organization } from '../../../schema/organization'

export interface SoldoCompany {
  id?: string
  name?: string
  legalName?: string
  currency?: string
  timezone?: string
  website?: string
  vatNumber?: string
  registrationNumber?: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    region?: string
    postalCode?: string
    country?: string
  }
  [key: string]: unknown
}

export function transformCompany(raw: SoldoCompany): Organization {
  return {
    id: raw.id ?? undefined,
    name: raw.name ?? undefined,
    legalName: raw.legalName ?? undefined,
    taxNumber: raw.vatNumber ?? raw.registrationNumber ?? undefined,
    currency: raw.currency ?? undefined,
    timezone: raw.timezone ?? undefined,
    website: raw.website ?? undefined,
    address: raw.address
      ? {
          address1: raw.address.line1 ?? undefined,
          address2: raw.address.line2 ?? undefined,
          city: raw.address.city ?? undefined,
          region: raw.address.region ?? undefined,
          postalCode: raw.address.postalCode ?? undefined,
          country: raw.address.country ?? undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
