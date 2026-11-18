import type { Contact } from '../../../schema/contact'

export interface BCCustomer {
  id: string
  number: string
  displayName: string
  type: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  phoneNumber?: string
  email?: string
  website?: string
  taxLiable?: boolean
  taxAreaId?: string
  taxRegistrationNumber?: string
  currencyCode?: string
  paymentTermsId?: string
  shipmentMethodId?: string
  paymentMethodId?: string
  blocked?: string
  balance?: number
  overdueAmount?: number
  totalSalesExcludingTax?: number
  lastModifiedDateTime?: string
  [key: string]: unknown
}

export function transformContact(raw: BCCustomer): Contact {
  return {
    id: raw.id,
    name: raw.displayName || undefined,
    taxNumber: raw.taxRegistrationNumber || undefined,
    isCustomer: true,
    isActive: raw.blocked === '' || raw.blocked === undefined,
    currency: raw.currencyCode || undefined,
    emails: raw.email ? [{ email: raw.email }] : undefined,
    telephones: raw.phoneNumber ? [{ telephone: raw.phoneNumber }] : undefined,
    billingAddress:
      raw.addressLine1 || raw.city || raw.country
        ? {
            address1: raw.addressLine1 || undefined,
            address2: raw.addressLine2 || undefined,
            city: raw.city || undefined,
            region: raw.state || undefined,
            postalCode: raw.postalCode || undefined,
            country: raw.country || undefined,
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
