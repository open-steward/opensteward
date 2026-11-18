/**
 * wFirma company info → canonical Organization.
 *
 * Endpoint: GET /companies/get/{companyId}
 * Credentials carry the company_id in extra.companyId (optional; may be
 * resolved from the session on the server side).
 */

import type { Organization } from '../../../schema/organization'
import { toIsoDatetime } from '@opensteward/shared'

/** Convert a raw upstream timestamp to a Date via toIsoDatetime for safe handling. */
function toDate(v: unknown): Date | undefined {
  const iso = toIsoDatetime(v)
  return iso ? new Date(iso) : undefined
}

export interface WfirmaCompany {
  id?: number | string
  name?: string
  altname?: string
  nip?: string      // Polish tax ID
  regon?: string
  street?: string
  building_number?: string
  flat_number?: string
  zip?: string
  city?: string
  country?: string  // ISO 3166-1 alpha-2
  email?: string
  phone?: string
  url?: string
  currency?: string
  created?: string
  modified?: string
  [key: string]: unknown
}

export function transformOrganization(raw: WfirmaCompany): Organization {
  const streetParts = [raw.street, raw.building_number, raw.flat_number].filter(Boolean)
  const address1 = streetParts.length > 0 ? streetParts.join(' ') : undefined

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.nip || raw.regon || undefined,
    currency: raw.currency || undefined,
    website: raw.url || undefined,
    address: address1 || raw.city || raw.zip || raw.country
      ? {
          address1,
          city: raw.city || undefined,
          postalCode: raw.zip || undefined,
          country: raw.country || undefined,
        }
      : undefined,
    createdAt: toDate(raw.created),
    updatedAt: toDate(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}
