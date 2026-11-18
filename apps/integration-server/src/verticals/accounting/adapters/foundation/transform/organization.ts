/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface FoundationOrganization {
  CompanyId: string | number
  CompanyName: string
  TaxId: string
  Address1: string
  Address2: string
  City: string
  State: string
  ZipCode: string
  Country: string
  Phone: string
  Email: string
  [key: string]: unknown
}

export function transformOrganization(raw: FoundationOrganization): Organization {
  return {
    name: raw.CompanyName || undefined,
    legalName: raw.CompanyName || undefined,
    taxNumber: raw.TaxId || undefined,
    address: toAddress({
      address1: raw.Address1,
      address2: raw.Address2,
      city: raw.City,
      region: raw.State,
      postalCode: raw.ZipCode,
      country: raw.Country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
