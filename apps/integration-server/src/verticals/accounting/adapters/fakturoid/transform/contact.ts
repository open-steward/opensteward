import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface FakturoidContact {
  id: number
  name: string
  full_name: string
  email: string
  phone: string
  web: string
  street: string
  city: string
  zip: string
  country: string
  registration_no: string
  vat_no: string
  type: string
  bank_account: string
  [key: string]: unknown
}

export function transformContact(raw: FakturoidContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK')].filter(Boolean) as NonNullable<
    ReturnType<typeof toPhone>
  >[]

  return {
    id: String(raw.id),
    name: raw.name || raw.full_name || undefined,
    companyName: raw.name || undefined,
    taxNumber: raw.vat_no || undefined,
    identification: raw.registration_no || undefined,
    isCustomer: raw.type === 'customer' || raw.type === 'both',
    isSupplier: raw.type === 'supplier' || raw.type === 'both',
    isActive: true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
