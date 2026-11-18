import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

export interface TripletexCustomer {
  id: number
  name: string
  organizationNumber: string
  email: string
  phoneNumber: string
  phoneNumberMobile: string
  isCustomer: boolean
  isSupplier: boolean
  isInactive: boolean
  currency?: { code: string }
  physicalAddress?: {
    addressLine1: string
    addressLine2: string
    city: string
    postalCode: string
    country?: { id: string }
  }
  [key: string]: unknown
}

export function transformContact(raw: TripletexCustomer): Contact {
  const emails: Email[] = raw.email ? [{ email: raw.email, type: 'WORK' }] : []
  const telephones: Telephone[] = []
  if (raw.phoneNumber) telephones.push({ telephone: raw.phoneNumber, type: 'WORK' })
  if (raw.phoneNumberMobile) telephones.push({ telephone: raw.phoneNumberMobile, type: 'MOBILE' })

  const addr = raw.physicalAddress
  const billingAddress: Address | undefined = addr
    ? {
        address1: addr.addressLine1 || undefined,
        address2: addr.addressLine2 || undefined,
        city: addr.city || undefined,
        postalCode: addr.postalCode || undefined,
        country: addr.country?.id || undefined,
      }
    : undefined

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.organizationNumber || undefined,
    isCustomer: raw.isCustomer,
    isSupplier: raw.isSupplier,
    isActive: !raw.isInactive,
    currency: raw.currency?.code || undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress,
    metadata: raw as Record<string, unknown>,
  }
}
