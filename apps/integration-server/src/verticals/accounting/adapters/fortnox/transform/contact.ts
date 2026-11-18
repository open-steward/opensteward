import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty, prefixedId } from '../../shared/transform'

export interface FortnoxCustomer {
  CustomerNumber: string
  Name: string
  OrganisationNumber: string
  Email: string
  Phone: string
  Fax: string
  Address1: string
  Address2: string
  City: string
  ZipCode: string
  CountryCode: string
  Currency: string
  Active: boolean
  DeliveryAddress1: string
  DeliveryAddress2: string
  DeliveryCity: string
  DeliveryZipCode: string
  DeliveryCountryCode: string
  [key: string]: unknown
}

export interface FortnoxSupplier {
  SupplierNumber: string
  Name: string
  OrganisationNumber: string
  VATNumber: string
  Email: string
  Phone1: string
  Phone2: string
  Fax: string
  Address1: string
  Address2: string
  City: string
  ZipCode: string
  CountryCode: string
  Currency: string
  Active: boolean
  [key: string]: unknown
}

export function transformCustomer(raw: FortnoxCustomer): Contact {
  const emails = toWorkEmail(raw.Email)
  const telephones: Telephone[] = []
  if (raw.Phone) telephones.push({ telephone: raw.Phone, type: 'WORK' })
  if (raw.Fax) telephones.push({ telephone: raw.Fax, type: 'FAX' })

  return {
    id: prefixedId('cust', raw.CustomerNumber),
    name: raw.Name || undefined,
    identification: raw.OrganisationNumber || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.Active,
    currency: raw.Currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Address1,
      address2: raw.Address2,
      city: raw.City,
      postalCode: raw.ZipCode,
      country: raw.CountryCode,
    }),
    shippingAddress: toAddress({
      address1: raw.DeliveryAddress1,
      address2: raw.DeliveryAddress2,
      city: raw.DeliveryCity,
      postalCode: raw.DeliveryZipCode,
      country: raw.DeliveryCountryCode,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformSupplier(raw: FortnoxSupplier): Contact {
  const emails = toWorkEmail(raw.Email)
  const telephones: Telephone[] = []
  if (raw.Phone1) telephones.push({ telephone: raw.Phone1, type: 'WORK' })
  if (raw.Fax) telephones.push({ telephone: raw.Fax, type: 'FAX' })

  return {
    id: prefixedId('supp', raw.SupplierNumber),
    name: raw.Name || undefined,
    identification: raw.OrganisationNumber || undefined,
    taxNumber: raw.VATNumber || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.Active,
    currency: raw.Currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Address1,
      address2: raw.Address2,
      city: raw.City,
      postalCode: raw.ZipCode,
      country: raw.CountryCode,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
