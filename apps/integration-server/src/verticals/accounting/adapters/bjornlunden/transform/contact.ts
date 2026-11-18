import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface BlContact {
  Id: string
  Name: string
  OrgNumber: string
  Email: string
  Phone: string
  Address1: string
  City: string
  ZipCode: string
  Country: string
  IsCustomer: boolean
  IsSupplier: boolean
  IsActive: boolean
  Currency: string
  [key: string]: unknown
}

export function transformContact(raw: BlContact): Contact {
  const emails = toWorkEmail(raw.Email)
  const telephones: Telephone[] = []
  const phone = toPhone(raw.Phone)
  if (phone) telephones.push(phone)

  return {
    id: raw.Id,
    name: raw.Name || undefined,
    identification: raw.OrgNumber || undefined,
    isCustomer: raw.IsCustomer,
    isSupplier: raw.IsSupplier,
    isActive: raw.IsActive,
    currency: raw.Currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Address1,
      city: raw.City,
      postalCode: raw.ZipCode,
      country: raw.Country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
