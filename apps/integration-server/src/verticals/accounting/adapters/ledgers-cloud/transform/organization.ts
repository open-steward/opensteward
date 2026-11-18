/**
 * LEDGERS.Cloud organization (business) transform.
 *
 * Endpoint: GET /v3/business/{id}  or  GET /v3/list-business
 *
 * Wire fields: id, business_name, legal_name, gstin, pan,
 *              currency, country, address, website
 */

import type { Organization } from '../../../schema/organization'

export interface LedgersBusiness {
  id?: string | number
  business_name?: string
  legal_name?: string
  gstin?: string
  pan?: string
  currency?: string
  country?: string
  website?: string
  address?: string
  city?: string
  state?: string
  pin_code?: string
  postal_code?: string
  timezone?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformOrganization(raw: LedgersBusiness): Organization {
  const hasAddress = !!(raw.address || raw.city || raw.pin_code || raw.postal_code || raw.country)
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.business_name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.gstin || raw.pan || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    address: hasAddress
      ? {
          address1: raw.address || undefined,
          city: raw.city || undefined,
          region: raw.state || undefined,
          postalCode: raw.pin_code || raw.postal_code || undefined,
          country: raw.country || undefined,
        }
      : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
