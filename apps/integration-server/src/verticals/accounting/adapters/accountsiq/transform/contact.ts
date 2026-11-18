import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface AccountsIQContact {
  contactId: string | number
  entityId: string | number
  name: string
  taxNumber: string
  registrationNumber: string
  email: string
  phone: string
  addressLine1: string
  addressLine2: string
  city: string
  postCode: string
  country: string
  isCustomer: boolean
  isSupplier: boolean
  isActive: boolean
  [key: string]: unknown
}

export function transformContact(raw: AccountsIQContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.phone, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.contactId),
    name: raw.name || undefined,
    identification: raw.registrationNumber || undefined,
    taxNumber: raw.taxNumber || undefined,
    isCustomer: raw.isCustomer ?? false,
    isSupplier: raw.isSupplier ?? false,
    isActive: raw.isActive,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.addressLine1,
      address2: raw.addressLine2,
      city: raw.city,
      postalCode: raw.postCode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
