/**
 * MineralTree company/user info → canonical Organization transform.
 *
 * Endpoint: GET /mtapi/base/services/user/current
 *
 * MineralTree exposes basic company details on the current user record.
 * The `company` sub-object contains the name and identifier.
 */

import type { Organization } from '../../../schema/organization'

export interface MtCompany {
  id?: string
  name?: string
  externalId?: string
  taxId?: string
  address?: {
    address1?: string
    address2?: string
    town?: string
    postalCode?: string
    ctrySubDivision?: string
    country?: string
  }
  [key: string]: unknown
}

export interface MtUserInfo {
  company?: MtCompany
  [key: string]: unknown
}

export function transformOrganization(raw: MtCompany): Organization {
  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.taxId ?? raw.externalId ?? undefined,
    address: raw.address
      ? {
          address1: raw.address.address1 || undefined,
          address2: raw.address.address2 || undefined,
          city: raw.address.town || undefined,
          postalCode: raw.address.postalCode || undefined,
          region: raw.address.ctrySubDivision || undefined,
          country: raw.address.country ? raw.address.country.slice(0, 2) : undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
