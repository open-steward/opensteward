import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface DineroContact {
  ContactGuid: string
  Name: string
  VatNumber: string
  Email: string
  Phone: string
  Address: string
  City: string
  ZipCode: string
  CountryKey: string
  IsPerson: boolean
  IsHidden: boolean
  [key: string]: unknown
}

export function transformContact(raw: DineroContact): Contact {
  const emails = toWorkEmail(raw.Email)
  const telephones: Telephone[] = []
  const phone = toPhone(raw.Phone)
  if (phone) telephones.push(phone)

  return {
    id: raw.ContactGuid,
    name: raw.Name || undefined,
    identification: raw.VatNumber || undefined,
    isCustomer: true,
    isSupplier: !raw.IsPerson,
    isActive: !raw.IsHidden,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Address,
      city: raw.City,
      postalCode: raw.ZipCode,
      country: raw.CountryKey,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
