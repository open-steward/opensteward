/**
 * Transform Brex company info to the canonical Organization type.
 *
 * Endpoint: GET /v2/company
 *
 * Brex company shape:
 * {
 *   id: string
 *   legal_name?: string
 *   display_name?: string
 *   website?: string
 *   incorporation_type?: string
 *   ein?: string                     // employer identification number (US tax ID)
 *   contact_preference?: { email?: string; phone?: string }
 *   business_address?: {
 *     line1?: string
 *     line2?: string
 *     city?: string
 *     state?: string
 *     country?: string               // ISO-2
 *     postal_code?: string
 *   }
 * }
 */

import type { Organization } from '../../../schema/organization'

export interface BrexBusinessAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  country?: string
  postal_code?: string
}

export interface BrexCompany {
  id?: string
  legal_name?: string
  display_name?: string
  website?: string
  ein?: string
  contact_preference?: { email?: string; phone?: string }
  business_address?: BrexBusinessAddress
  [key: string]: unknown
}

export function transformOrganization(raw: BrexCompany): Organization {
  const addr = raw.business_address
  return {
    id: raw.id || undefined,
    name: raw.display_name || raw.legal_name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.ein || undefined,
    website: raw.website || undefined,
    address: addr
      ? {
          address1: addr.line1 || undefined,
          address2: addr.line2 || undefined,
          city: addr.city || undefined,
          region: addr.state || undefined,
          postalCode: addr.postal_code || undefined,
          country: addr.country || undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
