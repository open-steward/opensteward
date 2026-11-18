import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface FinlyContact {
  id: string
  name: string
  email: string
  phone: string
  company: string
  tax_number: string
  address: {
    street: string
    city: string
    state: string
    zip: string
    country: string
  } | null
  is_active: boolean
  [key: string]: unknown
}

export function transformContact(raw: FinlyContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: raw.id,
    name: raw.name || undefined,
    companyName: raw.company || undefined,
    taxNumber: raw.tax_number || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.is_active,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.address
      ? toAddress({
          address1: raw.address.street,
          city: raw.address.city,
          region: raw.address.state,
          postalCode: raw.address.zip,
          country: raw.address.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
