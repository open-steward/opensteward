import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty, toPhone } from '../../shared/transform'

export interface UnimicroContact {
  ID?: number
  Info?: {
    Name?: string
    DefaultEmail?: { EmailAddress?: string }
    Phones?: { Number?: string; [key: string]: unknown }[]
    Addresses?: {
      AddressLine1?: string
      City?: string
      PostalCode?: string
      Country?: string
      [key: string]: unknown
    }[]
  }
  OrgNumber?: string
  IsCustomer?: boolean
  IsSupplier?: boolean
  Active?: boolean
  [key: string]: unknown
}

export function transformContact(raw: UnimicroContact): Contact {
  const emails = toWorkEmail(raw.Info?.DefaultEmail?.EmailAddress)
  const phone = toPhone(raw.Info?.Phones?.[0]?.Number)
  const addr = raw.Info?.Addresses?.[0]
  return {
    id: String(raw.ID ?? ''),
    name: raw.Info?.Name || undefined,
    identification: raw.OrgNumber || undefined,
    isCustomer: raw.IsCustomer ?? true,
    isSupplier: raw.IsSupplier ?? false,
    isActive: raw.Active ?? true,
    emails: nonempty(emails),
    telephones: phone ? [phone] : undefined,
    billingAddress: toAddress({
      address1: addr?.AddressLine1,
      city: addr?.City,
      postalCode: addr?.PostalCode,
      country: addr?.Country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
