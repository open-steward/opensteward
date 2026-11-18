/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface TallyOrganization {
  COMPANYNAME: string
  ADDRESS?: string
  PINCODE?: string
  STATENAME?: string
  COUNTRYNAME?: string
  EMAIL?: string
  PHONE?: string
  GSTIN?: string
  [key: string]: unknown
}

export function transformOrganization(raw: TallyOrganization): Organization {
  return {
    id: raw.COMPANYNAME,
    name: raw.COMPANYNAME,
    legalName: raw.COMPANYNAME,
    taxNumber: raw.GSTIN || undefined,
    address: toAddress({
      address1: raw.ADDRESS,
      postalCode: raw.PINCODE,
      region: raw.STATENAME,
      country: toIso3166Alpha2(raw.COUNTRYNAME),
    }),
    metadata: raw as Record<string, unknown>,
  }
}
