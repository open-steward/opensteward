import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface AutocountDebtor {
  DebtorCode: string
  CompanyName: string
  Email: string
  Phone: string
  Fax: string
  Address1: string
  Address2: string
  Address3: string
  AreaCode: string
  PostCode: string
  CountryCode: string
  CurrencyCode: string
  IsActive: boolean
  GSTRegistrationNo: string
  [key: string]: unknown
}

export interface AutocountCreditor {
  CreditorCode: string
  CompanyName: string
  Email: string
  Phone: string
  Address1: string
  Address2: string
  PostCode: string
  CountryCode: string
  CurrencyCode: string
  IsActive: boolean
  [key: string]: unknown
}

export function transformDebtor(raw: AutocountDebtor): Contact {
  const emails = toWorkEmail(raw.Email)
  const telephones: Telephone[] = []
  if (raw.Phone) telephones.push({ telephone: raw.Phone, type: 'WORK' })
  if (raw.Fax) telephones.push({ telephone: raw.Fax, type: 'FAX' })

  return {
    id: `debtor_${raw.DebtorCode}`,
    name: raw.CompanyName || undefined,
    taxNumber: raw.GSTRegistrationNo || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.IsActive,
    currency: raw.CurrencyCode || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Address1,
      address2: raw.Address2,
      city: raw.AreaCode,
      postalCode: raw.PostCode,
      country: raw.CountryCode,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformCreditor(raw: AutocountCreditor): Contact {
  const emails = toWorkEmail(raw.Email)
  const telephones: Telephone[] = []
  if (raw.Phone) telephones.push({ telephone: raw.Phone, type: 'WORK' })

  return {
    id: `creditor_${raw.CreditorCode}`,
    name: raw.CompanyName || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.IsActive,
    currency: raw.CurrencyCode || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Address1,
      address2: raw.Address2,
      postalCode: raw.PostCode,
      country: raw.CountryCode,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
