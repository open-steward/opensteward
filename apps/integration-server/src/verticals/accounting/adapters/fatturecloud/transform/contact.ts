import type { Contact } from '../../../schema/contact'

export interface FattureCloudClient {
  id?: number | string
  name?: string
  first_name?: string
  last_name?: string
  vat_number?: string
  fiscal_code?: string
  email?: string
  phone?: string
  type?: string
  address_street?: string
  address_postal_code?: string
  address_city?: string
  address_province?: string
  address_country?: string
  [key: string]: unknown
}

export function transformContact(raw: FattureCloudClient): Contact {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || undefined,
    firstName: raw.first_name || undefined,
    lastName: raw.last_name || undefined,
    companyName: raw.type === 'company' ? (raw.name || undefined) : undefined,
    taxNumber: raw.vat_number || raw.fiscal_code || undefined,
    isCustomer: true,
    emails: raw.email ? [{ email: raw.email }] : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone }] : undefined,
    billingAddress:
      raw.address_city || raw.address_street
        ? {
            address1: raw.address_street || undefined,
            city: raw.address_city || undefined,
            region: raw.address_province || undefined,
            postalCode: raw.address_postal_code || undefined,
            country: raw.address_country || undefined,
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
