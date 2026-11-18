/**
 * Reckon One v2 book (cashbook / organisation) transform.
 *
 * In Reckon One, a "book" corresponds to an accounting entity (organisation).
 * API endpoint: GET /R1/{cashbookId} (a single book record) — or
 *               GET /R1/books to list accessible books.
 *
 * Key fields: id, name, currencyCode, timezone, fiscalYearEnd,
 *             address.{street, city, state, postCode, country}
 */

import type { Organization } from '../../../schema/organization'

export interface ReckonOneBook {
  id?: string
  name?: string
  legalName?: string
  currencyCode?: string
  timezone?: string
  taxNumber?: string
  fiscalYearEnd?: string
  website?: string
  address?: {
    street?: string
    city?: string
    state?: string
    postCode?: string
    country?: string
  }
  createdDateTime?: string
  modifiedDateTime?: string
  [key: string]: unknown
}

export function transformOrganization(raw: ReckonOneBook): Organization {
  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.taxNumber || undefined,
    currency: raw.currencyCode || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    address: raw.address
      ? {
          address1: raw.address.street || undefined,
          city: raw.address.city || undefined,
          region: raw.address.state || undefined,
          postalCode: raw.address.postCode || undefined,
          country: raw.address.country || undefined,
        }
      : undefined,
    createdAt: raw.createdDateTime ? new Date(raw.createdDateTime) : undefined,
    updatedAt: raw.modifiedDateTime ? new Date(raw.modifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
