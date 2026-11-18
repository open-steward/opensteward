/**
 * Manager business-details → canonical Organization transform.
 *
 * Manager does not expose a dedicated /business endpoint in API2.
 * The business slug (used as tenantId) comes from the connection credentials.
 * This transform wraps whatever metadata the adapter can gather about the
 * connected business.
 */
import type { Organization } from '../../../schema/organization'

export interface ManagerBusinessDetails {
  key?: string
  name?: string
  businessName?: string
  taxNumber?: string
  currency?: string
  address?: string
  website?: string
  email?: string
  phone?: string
  /** Business slug from the cloud URL, e.g. "northwind" */
  slug?: string
  [key: string]: unknown
}

export function transformOrganization(raw: ManagerBusinessDetails): Organization {
  const name = raw.businessName ?? raw.name

  // Manager stores the address as a multiline string; extract first line for address1
  const addressLines = (raw.address ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  return {
    id: raw.key ?? raw.slug,
    name: name || undefined,
    legalName: name || undefined,
    taxNumber: raw.taxNumber || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address:
      addressLines.length > 0
        ? {
            address1: addressLines[0],
            address2: addressLines[1],
            city: addressLines[2],
            postalCode: addressLines[3],
            country: addressLines[4],
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
