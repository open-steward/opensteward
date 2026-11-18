/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Organization } from '../../../schema/organization'

export interface SapB1Company {
  CompanyName: string
  CompanyNameForeign: string
  TaxOffice: string
  BasicCurrency: string
  Street: string
  City: string
  ZipCode: string
  Country: string
  Phone1: string
  Email: string
  [key: string]: unknown
}

export function transformOrganization(raw: SapB1Company): Organization {
  return {
    name: raw.CompanyName || undefined,
    legalName: raw.CompanyName || undefined,
    taxNumber: raw.TaxOffice || undefined,
    currency: raw.BasicCurrency || undefined,
    address: {
      address1: raw.Street || undefined,
      city: raw.City || undefined,
      postalCode: raw.ZipCode || undefined,
      country: raw.Country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
