import type { Organization } from '../../../schema/organization'

// ── Crunch wire types ─────────────────────────────────────────────────────────

export interface CrunchAddressDetail {
  addressLine1?: string
  addressCity?: string
  addressPostCode?: string
  addressCountry?: string
}

/** CompanyDetails from GET /company-details/ (wrapped in ResponseWrapper.content[0]) */
export interface CrunchCompanyDetails {
  companyName?: string
  companyNumber?: string
  vatRegistrationNumber?: string
  businessAddress?: CrunchAddressDetail
  registeredAddress?: CrunchAddressDetail
  vatSchemeChanges?: Array<{
    dateFrom?: string
    dateTo?: string
    vatScheme?: string
    industry?: string
    limitedCostTrader?: boolean
  }>
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

function mapAddress(
  addr: CrunchAddressDetail | undefined,
): Organization['address'] | undefined {
  if (!addr) return undefined
  const any =
    addr.addressLine1 ??
    addr.addressCity ??
    addr.addressPostCode ??
    addr.addressCountry
  if (!any) return undefined
  return {
    address1: addr.addressLine1 ?? undefined,
    city: addr.addressCity ?? undefined,
    postalCode: addr.addressPostCode ?? undefined,
    country: addr.addressCountry ?? undefined,
  }
}

export function transformOrganization(raw: CrunchCompanyDetails): Organization {
  return {
    name: raw.companyName ?? undefined,
    organizationCode: raw.companyNumber ?? undefined,
    taxNumber: raw.vatRegistrationNumber ?? undefined,
    address: mapAddress(raw.businessAddress ?? raw.registeredAddress),
    metadata: raw as Record<string, unknown>,
  }
}
