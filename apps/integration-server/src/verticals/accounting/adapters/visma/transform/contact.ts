import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface VismaCustomer {
  Id: string
  CustomerNumber: string
  Name: string
  CorporateIdentityNumber: string
  EmailAddress: string
  Telephone: string
  MobilePhone: string
  ContactPersonName: string
  ContactPersonEmail: string
  ContactPersonPhone: string
  ContactPersonMobile: string
  InvoiceAddress1: string
  InvoiceAddress2: string
  InvoiceCity: string
  InvoicePostalCode: string
  InvoiceCountryCode: string
  DeliveryAddress1: string
  DeliveryAddress2: string
  DeliveryCity: string
  DeliveryPostalCode: string
  DeliveryCountryCode: string
  CurrencyCode: string
  IsActive: boolean
  VatNumber: string
  ChangedUtc: string
  [key: string]: unknown
}

export interface VismaSupplier {
  Id: string
  SupplierNumber: string
  Name: string
  CorporateIdentityNumber: string
  EmailAddress: string
  Telephone: string
  MobilePhone: string
  ContactPersonName: string
  ContactPersonEmail: string
  ContactPersonPhone: string
  ContactPersonMobile: string
  Address1: string
  Address2: string
  City: string
  PostalCode: string
  CountryCode: string
  CurrencyCode: string
  IsActive: boolean
  ModifiedUtc: string
  [key: string]: unknown
}

export function transformCustomer(raw: VismaCustomer): Contact {
  const emails = toWorkEmail(raw.EmailAddress)
  const telephones: Telephone[] = []
  if (raw.Telephone) telephones.push({ telephone: raw.Telephone, type: 'WORK' })
  if (raw.MobilePhone) telephones.push({ telephone: raw.MobilePhone, type: 'MOBILE' })

  return {
    id: `cust_${raw.Id}`,
    name: raw.Name || undefined,
    identification: raw.CorporateIdentityNumber || undefined,
    taxNumber: raw.VatNumber || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.IsActive,
    currency: raw.CurrencyCode || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.InvoiceAddress1,
      address2: raw.InvoiceAddress2,
      city: raw.InvoiceCity,
      postalCode: raw.InvoicePostalCode,
      country: raw.InvoiceCountryCode,
    }),
    shippingAddress: toAddress({
      address1: raw.DeliveryAddress1,
      address2: raw.DeliveryAddress2,
      city: raw.DeliveryCity,
      postalCode: raw.DeliveryPostalCode,
      country: raw.DeliveryCountryCode,
    }),
    updatedAt: raw.ChangedUtc ? new Date(raw.ChangedUtc) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformSupplier(raw: VismaSupplier): Contact {
  const emails = toWorkEmail(raw.EmailAddress)
  const telephones: Telephone[] = []
  if (raw.Telephone) telephones.push({ telephone: raw.Telephone, type: 'WORK' })
  if (raw.MobilePhone) telephones.push({ telephone: raw.MobilePhone, type: 'MOBILE' })

  return {
    id: `supp_${raw.Id}`,
    name: raw.Name || undefined,
    identification: raw.CorporateIdentityNumber || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.IsActive,
    currency: raw.CurrencyCode || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Address1,
      address2: raw.Address2,
      city: raw.City,
      postalCode: raw.PostalCode,
      country: raw.CountryCode,
    }),
    updatedAt: raw.ModifiedUtc ? new Date(raw.ModifiedUtc) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
