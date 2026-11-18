/**
 * Medius company → canonical Organization.
 *
 * Endpoint: GET /integration/masterdata/v1/companies
 * Response body: CompanyExportPageDto  { companies: CompanyDto[], offset, limit, total }
 *
 * CompanyDto key fields:
 *   name, companyId, organizationNumber, accountingCurrencyCode,
 *   parentCompany, isVirtualCompany, isActive,
 *   mediusFlowSystemId, globalId,
 *   addresses[]  (AddressDto: streetAddress, zip, city, country, state)
 */

import type { Organization } from '../../../schema/organization'

// ── Raw Medius types ───────────────────────────────────────────────────────────

export interface MediusAddressDto {
  streetAddress?: string
  zip?: string
  city?: string
  country?: string
  state?: string
  [key: string]: unknown
}

export interface MediusCompany {
  name?: string
  externalDisplayName?: string
  companyId?: string
  organizationNumber?: string
  parentCompany?: string
  isVirtualCompany?: boolean
  isActive?: boolean
  accountingCurrencyCode?: string
  mediusFlowSystemId?: string
  globalId?: string
  addresses?: MediusAddressDto[]
  [key: string]: unknown
}

export interface MediusCompanyPage {
  companies: MediusCompany[]
  offset: number
  limit: number
  total: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function strOrUndef(val: unknown): string | undefined {
  return typeof val === 'string' && val ? val : undefined
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformOrganization(raw: MediusCompany): Organization {
  const addr = raw.addresses?.[0]
  return {
    id: strOrUndef(raw.companyId) || strOrUndef(raw.mediusFlowSystemId) || strOrUndef(raw.globalId) || undefined,
    name: strOrUndef(raw.name),
    organizationCode: strOrUndef(raw.companyId),
    taxNumber: strOrUndef(raw.organizationNumber),
    currency: strOrUndef(raw.accountingCurrencyCode),
    address: addr
      ? {
          address1: strOrUndef(addr.streetAddress),
          city: strOrUndef(addr.city),
          region: strOrUndef(addr.state),
          postalCode: strOrUndef(addr.zip),
          country: strOrUndef(addr.country),
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
