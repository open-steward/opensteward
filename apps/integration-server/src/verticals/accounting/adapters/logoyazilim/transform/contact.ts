import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, toPhone, nonempty } from '../../shared/transform'

export interface LogoContact {
  id: string
  Name?: string
  Type?: string  // 'Customer' | 'Supplier'
  Email?: string
  Phone?: string
  Address?: string
  City?: string
  Country?: string
  TaxId?: string
  [key: string]: unknown
}

export function transformContact(raw: LogoContact): Contact {
  const emails = toWorkEmail(raw.Email)
  const phone = toPhone(raw.Phone)
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.id),
    name: raw.Name || undefined,
    taxNumber: raw.TaxId || undefined,
    isCustomer: raw.Type === 'Customer' || raw.Type === undefined,
    isSupplier: raw.Type === 'Supplier',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Address,
      city: raw.City,
      country: raw.Country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
