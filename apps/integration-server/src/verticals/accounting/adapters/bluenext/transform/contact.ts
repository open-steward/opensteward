import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface BluenextContact {
  id: string
  name: string
  vatNumber: string
  taxCode: string
  email: string
  phone: string
  address: string
  city: string
  postalCode: string
  province: string
  country: string
  currency: string
  isActive: boolean
  contactType: string
  [key: string]: unknown
}

export function transformContact(raw: BluenextContact): Contact {
  const emails = toWorkEmail(raw.email)

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.taxCode || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: raw.contactType === 'customer' || raw.contactType === 'both',
    isSupplier: raw.contactType === 'supplier' || raw.contactType === 'both',
    isActive: raw.isActive,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.postalCode,
      region: raw.province,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
