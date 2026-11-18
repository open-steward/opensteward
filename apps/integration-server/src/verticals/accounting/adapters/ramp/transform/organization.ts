/**
 * Ramp business → canonical Organization.
 *
 * Ramp endpoint: GET /developer/v1/business
 *
 * Key fields:
 *   id                 string
 *   business_name_legal string
 *   display_name       string
 *   website            string
 *   employer_id        string — tax ID (EIN)
 *   address            object — { street1, street2, city, state, postal_code, country }
 *   currency_code      string — primary currency
 *   created_time       string — ISO datetime
 */

import type { Organization } from '../../../schema/organization'

export interface RampBusinessAddress {
  street1?: string
  street2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
}

export interface RampBusiness {
  id?: string
  business_name_legal?: string
  display_name?: string
  website?: string
  employer_id?: string
  address?: RampBusinessAddress
  currency_code?: string
  created_time?: string
  [key: string]: unknown
}

export function transformOrganization(raw: RampBusiness): Organization {
  return {
    id: raw.id || undefined,
    name: raw.display_name || raw.business_name_legal || undefined,
    legalName: raw.business_name_legal || undefined,
    taxNumber: raw.employer_id || undefined,
    currency: raw.currency_code || undefined,
    website: raw.website || undefined,
    address: raw.address
      ? {
          address1: raw.address.street1 || undefined,
          address2: raw.address.street2 || undefined,
          city: raw.address.city || undefined,
          region: raw.address.state || undefined,
          postalCode: raw.address.postal_code || undefined,
          country: raw.address.country || undefined,
        }
      : undefined,
    createdAt: raw.created_time ? new Date(raw.created_time) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
