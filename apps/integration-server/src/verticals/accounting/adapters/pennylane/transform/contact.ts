import type { Contact } from '../../../schema/contact'

export interface PennylaneContact {
  source_id: string
  name: string
  first_name: string
  last_name: string
  email: string
  phone: string
  address: { street: string; postal_code: string; city: string; country_alpha2: string } | null
  is_customer: boolean
  is_supplier: boolean
  [key: string]: unknown
}

export function transformContact(raw: PennylaneContact): Contact {
  return {
    id: raw.source_id,
    name: raw.name || undefined,
    firstName: raw.first_name || undefined,
    lastName: raw.last_name || undefined,
    isCustomer: raw.is_customer,
    isSupplier: raw.is_supplier,
    emails: raw.email ? [{ email: raw.email, type: 'WORK' as const }] : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone, type: 'WORK' as const }] : undefined,
    billingAddress: raw.address
      ? {
          address1: raw.address.street || undefined,
          postalCode: raw.address.postal_code || undefined,
          city: raw.address.city || undefined,
          country: raw.address.country_alpha2 || undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
