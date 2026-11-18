import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

export interface PowerOfficeContact {
  id: number
  code: string
  name: string
  emailAddress: string
  phoneNumber: string
  isCustomer: boolean
  isSupplier: boolean
  isActive: boolean
  currencyCode: string
  mailAddress?: {
    addressLine1: string
    postalCode: string
    city: string
    countryCode: string
  }
  [key: string]: unknown
}

export function transformContact(raw: PowerOfficeContact): Contact {
  const emails: Email[] = raw.emailAddress ? [{ email: raw.emailAddress, type: 'WORK' }] : []
  const telephones: Telephone[] = raw.phoneNumber
    ? [{ telephone: raw.phoneNumber, type: 'WORK' }]
    : []

  const billingAddress: Address | undefined = raw.mailAddress
    ? {
        address1: raw.mailAddress.addressLine1 || undefined,
        city: raw.mailAddress.city || undefined,
        postalCode: raw.mailAddress.postalCode || undefined,
        country: raw.mailAddress.countryCode || undefined,
      }
    : undefined

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    isCustomer: raw.isCustomer,
    isSupplier: raw.isSupplier,
    isActive: raw.isActive,
    currency: raw.currencyCode || undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress,
    metadata: raw as Record<string, unknown>,
  }
}
