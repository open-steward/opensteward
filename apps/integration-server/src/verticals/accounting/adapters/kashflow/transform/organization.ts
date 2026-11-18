import type { Organization } from '../../../schema/organization'

// KashFlow REST API v2 — Settings (company info)
// Docs: https://www.kashflow.com/developers/rest-api/api-settings/

export interface KashflowSettingsAddress {
  Line1?: string
  Line2?: string
  Line3?: string
  Line4?: string
  PostCode?: string
  [key: string]: unknown
}

export interface KashflowHomeCurrency {
  Code?: string
  Symbol?: string
  [key: string]: unknown
}

export interface KashflowSettings {
  CompanyName?: string
  PrimaryContact?: string
  Telephone?: string
  VATRegistered?: boolean
  DateFormat?: string
  Address?: KashflowSettingsAddress
  HomeCurrency?: KashflowHomeCurrency
  SiteName?: string
  [key: string]: unknown
}

export function transformOrganization(raw: KashflowSettings): Organization {
  const addr = raw.Address
  return {
    name: raw.CompanyName || undefined,
    legalName: raw.CompanyName || undefined,
    currency: raw.HomeCurrency?.Code || undefined,
    address: {
      address1: addr?.Line1 || undefined,
      address2: addr?.Line2 || undefined,
      city: addr?.Line3 || undefined,
      region: addr?.Line4 || undefined,
      postalCode: addr?.PostCode || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
