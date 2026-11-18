import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface HinawiBillingAddress {
  Street: string
  City: string
  PostalCode: string
  Country: string
  [key: string]: unknown
}

export interface HinawiContact {
  id: string | number
  Name: string
  Email: string
  Phone: string
  BillingAddress: HinawiBillingAddress | null
  TaxId: string
  IsCustomer: boolean
  IsVendor: boolean
  [key: string]: unknown
}

export function transformContact(raw: HinawiContact): Contact {
  const emails = toWorkEmail(raw.Email)
  const phone = toPhone(raw.Phone)
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: raw.Name || undefined,
    identification: raw.TaxId || undefined,
    isCustomer: raw.IsCustomer,
    isSupplier: raw.IsVendor,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.BillingAddress
      ? toAddress({
          address1: raw.BillingAddress.Street,
          city: raw.BillingAddress.City,
          postalCode: raw.BillingAddress.PostalCode,
          country: raw.BillingAddress.Country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
