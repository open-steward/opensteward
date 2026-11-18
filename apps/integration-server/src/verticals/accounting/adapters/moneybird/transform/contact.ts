import type { Contact } from '../../../schema/contact'

export interface MoneybirdContact {
  id?: number | string
  company_name?: string
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
  customer_id?: string
  tax_number?: string
  address1?: string
  address2?: string
  zipcode?: string
  city?: string
  country?: string
  [key: string]: unknown
}

export function transformContact(raw: MoneybirdContact): Contact {
  const name = raw.company_name || (raw.firstname || raw.lastname ? `${raw.firstname ?? ''} ${raw.lastname ?? ''}`.trim() : undefined)
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name,
    companyName: raw.company_name || undefined,
    firstName: raw.firstname || undefined,
    lastName: raw.lastname || undefined,
    taxNumber: raw.tax_number || undefined,
    isCustomer: true,
    emails: raw.email ? [{ email: raw.email }] : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone }] : undefined,
    billingAddress:
      raw.address1 || raw.city
        ? {
            address1: raw.address1 || undefined,
            address2: raw.address2 || undefined,
            city: raw.city || undefined,
            postalCode: raw.zipcode || undefined,
            country: raw.country || undefined,
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
