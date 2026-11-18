/**
 * Webgility Connect Vendors API → Supplier transform.
 *
 * Endpoint: GET /v1/vendors, GET /v1/vendors/{VendorId}
 * Ref: https://github.com/webgility/connect-v1.0/wiki/Vendors-API
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawWebgilityVendor {
  VendorId: string
  VendorName?: string
  FirstName?: string
  MiddleName?: string
  LastName?: string
  CompanyName?: string
  IsActive?: boolean
  EmailAddress?: string
  Website?: string
  BankAccountNumber?: string
  Balance?: number
  TaxId?: string
  Phones?: Array<{
    PhoneType?: string
    FullPhoneNumber?: string
  }>
  Addresses?: Array<{
    AddressType?: string
    AddressLine1?: string
    AddressLine2?: string
    AddressLine3?: string
    AddressLine4?: string
    City?: string
    Region?: string
    PostalCode?: string
    Country?: string
    AttentionTo?: string
  }>
  ResponseAt?: string
  CreatedAt?: string
  UpdatedAt?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawWebgilityVendor): Supplier {
  const primaryPhone = (raw.Phones ?? []).find((p) => p.PhoneType === 'PrimaryPhone' || p.FullPhoneNumber)
  const billingAddress = (raw.Addresses ?? []).find((a) => a.AddressType === 'Billing' || a.AddressType === 'STREET')

  return {
    id: raw.VendorId,
    externalId: raw.VendorId,
    name: pickStr(raw.VendorName) ?? pickStr(raw.CompanyName) ?? '',
    email: pickStr(raw.EmailAddress),
    phone: pickStr(primaryPhone?.FullPhoneNumber),
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    isActive: raw.IsActive !== false,
    platform: 'webgility',
    metadata: strMap({
      companyName: raw.CompanyName,
      website: raw.Website,
      taxId: raw.TaxId,
      billingCity: billingAddress?.City,
      billingCountry: billingAddress?.Country,
    }),
    raw,
  }
}
