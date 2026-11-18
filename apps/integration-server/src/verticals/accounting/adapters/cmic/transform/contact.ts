import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface CmicContact {
  VendorId: string
  Name: string
  TaxId: string
  Email: string
  Phone: string
  Address: string
  City: string
  State: string
  PostalCode: string
  Country: string
  IsActive: boolean
  [key: string]: unknown
}

export function transformContact(raw: CmicContact): Contact {
  const emails = toWorkEmail(raw.Email)
  const phone = toPhone(raw.Phone, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.VendorId),
    name: raw.Name || undefined,
    identification: raw.TaxId || undefined,
    taxNumber: raw.TaxId || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.IsActive ?? true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Address,
      city: raw.City,
      region: raw.State,
      postalCode: raw.PostalCode,
      country: raw.Country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
