import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface FikenAddress {
  streetAddress: string
  city: string
  postCode: string
  country: string
  [key: string]: unknown
}

export interface FikenContact {
  contactId: number
  name: string
  email: string
  organizationNumber: string
  phoneNumber: string
  customer: boolean
  supplier: boolean
  currency: string
  address: FikenAddress
  [key: string]: unknown
}

export function transformContact(raw: FikenContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phoneNumber, 'WORK')].filter(Boolean) as NonNullable<
    ReturnType<typeof toPhone>
  >[]

  return {
    id: String(raw.contactId),
    name: raw.name || undefined,
    taxNumber: raw.organizationNumber || undefined,
    isCustomer: raw.customer,
    isSupplier: raw.supplier,
    isActive: true,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address?.streetAddress,
      city: raw.address?.city,
      postalCode: raw.address?.postCode,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
