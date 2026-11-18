import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, composeName, nonempty, prefixedId } from '../../shared/transform'

// QuickFile Client (accounts receivable contact)
export interface QuickFileClient {
  ClientID: number
  CompanyName?: string
  FirstName?: string
  Surname?: string
  AccountReference?: string
  AddressLine1?: string
  AddressLine2?: string
  AddressLine3?: string
  Town?: string
  CountryISO?: string
  Postcode?: string
  VatNumber?: string
  DefaultCurrency?: string
  Email?: string
  Telephone?: string
  [key: string]: unknown
}

// QuickFile Supplier (accounts payable contact)
export interface QuickFileSupplier {
  SupplierID: number
  CompanyName?: string
  FirstName?: string
  Surname?: string
  SupplierReference?: string
  AddressLine1?: string
  AddressLine2?: string
  AddressLine3?: string
  Town?: string
  CountryISO?: string
  Postcode?: string
  VatNumber?: string
  Email?: string
  Telephone?: string
  [key: string]: unknown
}

export function transformClient(raw: QuickFileClient): Contact {
  const emails = toWorkEmail(raw.Email)
  const telephones: Telephone[] = []
  if (raw.Telephone) telephones.push({ telephone: raw.Telephone, type: 'WORK' })

  return {
    id: prefixedId('cust', raw.ClientID),
    name: composeName(raw.CompanyName, raw.FirstName, raw.Surname),
    firstName: raw.FirstName || undefined,
    lastName: raw.Surname || undefined,
    companyName: raw.CompanyName || undefined,
    identification: raw.AccountReference || undefined,
    taxNumber: raw.VatNumber || undefined,
    isCustomer: true,
    isSupplier: false,
    currency: raw.DefaultCurrency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.AddressLine1,
      address2: raw.AddressLine2,
      city: raw.Town,
      postalCode: raw.Postcode,
      country: raw.CountryISO,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformSupplier(raw: QuickFileSupplier): Contact {
  const emails = toWorkEmail(raw.Email)
  const telephones: Telephone[] = []
  if (raw.Telephone) telephones.push({ telephone: raw.Telephone, type: 'WORK' })

  return {
    id: prefixedId('supp', raw.SupplierID),
    name: composeName(raw.CompanyName, raw.FirstName, raw.Surname),
    firstName: raw.FirstName || undefined,
    lastName: raw.Surname || undefined,
    companyName: raw.CompanyName || undefined,
    identification: raw.SupplierReference || undefined,
    taxNumber: raw.VatNumber || undefined,
    isCustomer: false,
    isSupplier: true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.AddressLine1,
      address2: raw.AddressLine2,
      city: raw.Town,
      postalCode: raw.Postcode,
      country: raw.CountryISO,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
