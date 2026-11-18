/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface Unit4Organization {
  companyId: string | number
  name: string
  legalName?: string
  organizationNumber?: string
  vatNumber?: string
  email?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    postalCode?: string
    country?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformOrganization(raw: Unit4Organization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.legalName || raw.name || undefined,
    taxNumber: raw.vatNumber || raw.organizationNumber || undefined,
    address: raw.address
      ? toAddress({
          address1: raw.address.street,
          city: raw.address.city,
          postalCode: raw.address.postalCode,
          country: raw.address.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
