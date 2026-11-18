import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

export interface QBOCustomer {
  Id: string
  DisplayName: string
  GivenName: string
  FamilyName: string
  CompanyName: string
  Active: boolean
  PrimaryEmailAddr?: { Address: string }
  PrimaryPhone?: { FreeFormNumber: string }
  BillAddr?: {
    Line1: string
    City: string
    PostalCode: string
    Country: string
    CountrySubDivisionCode?: string
  }
  ShipAddr?: {
    Line1: string
    City: string
    PostalCode: string
    Country: string
    CountrySubDivisionCode?: string
  }
  CurrencyRef?: { value: string }
  [key: string]: unknown
}

export interface QBOVendor {
  Id: string
  DisplayName: string
  GivenName: string
  FamilyName: string
  CompanyName: string
  Active: boolean
  PrimaryEmailAddr?: { Address: string }
  PrimaryPhone?: { FreeFormNumber: string }
  BillAddr?: {
    Line1: string
    City: string
    PostalCode: string
    Country: string
  }
  CurrencyRef?: { value: string }
  [key: string]: unknown
}

function mapAddr(addr: QBOCustomer['BillAddr']): Address | undefined {
  if (!addr) return undefined
  return {
    address1: addr.Line1 || undefined,
    city: addr.City || undefined,
    postalCode: addr.PostalCode || undefined,
    country: addr.Country || undefined,
  }
}

export function transformCustomer(raw: QBOCustomer): Contact {
  const emails: Email[] = raw.PrimaryEmailAddr?.Address
    ? [{ email: raw.PrimaryEmailAddr.Address, type: 'WORK' }]
    : []
  const telephones: Telephone[] = raw.PrimaryPhone?.FreeFormNumber
    ? [{ telephone: raw.PrimaryPhone.FreeFormNumber, type: 'WORK' }]
    : []

  return {
    id: `cust_${raw.Id}`,
    name: raw.DisplayName || undefined,
    firstName: raw.GivenName || undefined,
    lastName: raw.FamilyName || undefined,
    companyName: raw.CompanyName || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.Active,
    currency: raw.CurrencyRef?.value || undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: mapAddr(raw.BillAddr),
    shippingAddress: mapAddr(raw.ShipAddr),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformVendor(raw: QBOVendor): Contact {
  const emails: Email[] = raw.PrimaryEmailAddr?.Address
    ? [{ email: raw.PrimaryEmailAddr.Address, type: 'WORK' }]
    : []
  const telephones: Telephone[] = raw.PrimaryPhone?.FreeFormNumber
    ? [{ telephone: raw.PrimaryPhone.FreeFormNumber, type: 'WORK' }]
    : []

  return {
    id: `vend_${raw.Id}`,
    name: raw.DisplayName || undefined,
    firstName: raw.GivenName || undefined,
    lastName: raw.FamilyName || undefined,
    companyName: raw.CompanyName || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.Active,
    currency: raw.CurrencyRef?.value || undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: mapAddr(raw.BillAddr),
    metadata: raw as Record<string, unknown>,
  }
}
