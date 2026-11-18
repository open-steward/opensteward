/**
 * Access Financials organization transform.
 *
 * Access Financials does not expose a dedicated "company info" endpoint.
 * Organization data is assembled from the authenticated tenant context
 * returned by the system (typically available via a metadata query or
 * inferred from the subscription key's tenant).
 *
 * The AFOrganization shape represents what is available from the API's
 * system/tenant information.
 */
import type { Organization } from '../../../schema/organization'

export interface AFOrganization {
  /** Tenant / company identifier */
  id?: string | number
  name?: string
  legalName?: string
  taxNumber?: string
  currency?: string
  timezone?: string
  website?: string
  address?: {
    address?: string
    town?: string
    county?: string
    country?: string
    postCode?: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: AFOrganization): Organization {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.taxNumber || undefined,
    currency: raw.currency as Organization['currency'] | undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    address: raw.address
      ? {
          address1: raw.address.address || undefined,
          city: raw.address.town || undefined,
          region: raw.address.county || undefined,
          postalCode: raw.address.postCode || undefined,
          country: raw.address.country || undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
