import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface ZipBooksContact {
  id: string
  name: string
  email: string
  phone: string
  company: string
  tax_id: string
  is_customer: boolean
  is_supplier: boolean
  address: {
    street: string
    city: string
    state: string
    zip: string
    country: string
  } | null
  [key: string]: unknown
}

export function transformContact(raw: ZipBooksContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: raw.id,
    name: raw.name || undefined,
    companyName: raw.company || undefined,
    taxNumber: raw.tax_id || undefined,
    isCustomer: raw.is_customer ?? false,
    isSupplier: raw.is_supplier ?? false,
    isActive: true,
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
