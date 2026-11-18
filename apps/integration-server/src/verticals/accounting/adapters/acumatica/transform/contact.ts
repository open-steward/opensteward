import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface AcumaticaContact {
  ContactID: string
  DisplayName: string
  FirstName: string
  LastName: string
  Email: string
  Phone1: string
  Type: string
  BusinessAccountID: string
  Address: {
    AddressLine1: string
    AddressLine2: string
    City: string
    PostalCode: string
    CountryID: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformContact(raw: AcumaticaContact): Contact {
  const emails = toWorkEmail(raw.Email)
  const phone = toPhone(raw.Phone1, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.ContactID),
    name: raw.DisplayName || [raw.FirstName, raw.LastName].filter(Boolean).join(' ') || undefined,
    isCustomer: raw.Type === 'Customer',
    isSupplier: raw.Type === 'Vendor',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Address?.AddressLine1,
      address2: raw.Address?.AddressLine2,
      city: raw.Address?.City,
      postalCode: raw.Address?.PostalCode,
      country: raw.Address?.CountryID,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  return {
    DisplayName: data.name,
    Email: data.emails?.[0]?.email,
    Phone1: data.telephones?.[0]?.telephone,
    Address: {
      AddressLine1: data.billingAddress?.address1,
      City: data.billingAddress?.city,
      PostalCode: data.billingAddress?.postalCode,
      CountryID: data.billingAddress?.country,
    },
  }
}
