import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty } from '../../shared/transform'

export interface ProsvasisContact {
  id: string | number
  Name: string
  Type: string
  Email: string
  Phone: string
  Address: string
  City: string
  PostalCode: string
  Country: string
  TaxId: string
  [key: string]: unknown
}

export function transformContact(raw: ProsvasisContact): Contact {
  const emails = toWorkEmail(raw.Email)
  const phone = toPhone(raw.Phone, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: raw.Name || undefined,
    identification: raw.TaxId || undefined,
    taxNumber: raw.TaxId || undefined,
    isCustomer: raw.Type === 'Customer',
    isSupplier: raw.Type === 'Supplier',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Address,
      city: raw.City,
      postalCode: raw.PostalCode,
      country: raw.Country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
