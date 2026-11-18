/**
 * StoreFeeder supplier transform.
 *
 * Source: GET /suppliers  (returns array — no paging wrapper documented)
 * and GET /suppliers/{id} for a single supplier.
 *
 * Response fields per the API docs:
 *   SupplierID, Name, SupplierGUID, SupplierCode, Email,
 *   MinimumOrderValue, Reference, AccountNumber, CurrencyCode,
 *   SendBelowReorderLevelEmail, BelowReorderLevelReportRecipientEmailAddress,
 *   SupplierAddress { ContactName, AddressLine1, AddressLine2, Town,
 *                     County, Country, Postcode, Phone, Mobile },
 *   Currency { CurrencyBaseModel }
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

interface SupplierAddress {
  ContactName?: string
  AddressLine1?: string
  AddressLine2?: string
  Town?: string
  County?: string
  Country?: string
  Postcode?: string
  Phone?: string
  Mobile?: string
  [key: string]: unknown
}

export interface RawStoreFeederSupplier {
  SupplierID?: number
  SupplierGUID?: string
  Name?: string
  SupplierCode?: string
  Email?: string
  MinimumOrderValue?: number
  Reference?: string
  AccountNumber?: string
  SuppliersReference?: string
  CurrencyCode?: string
  Currency?: { CurrencyCode?: string; [key: string]: unknown }
  SupplierAddress?: SupplierAddress
  [key: string]: unknown
}

export function transformSupplier(raw: RawStoreFeederSupplier): Supplier {
  const id = String(raw.SupplierID ?? raw.SupplierGUID ?? '')
  const phone = pickStr(raw.SupplierAddress?.Phone) ?? pickStr(raw.SupplierAddress?.Mobile)
  const currency = pickStr(raw.CurrencyCode) ?? pickStr(raw.Currency?.CurrencyCode)

  return {
    id,
    externalId: id,
    name: pickStr(raw.Name) ?? '',
    email: pickStr(raw.Email),
    phone,
    defaultCurrency: currency,
    defaultLeadTimeDays: undefined,
    isActive: true,
    platform: 'store-feeder',
    metadata: strMap({
      supplierCode: raw.SupplierCode,
      reference: raw.Reference,
      accountNumber: raw.AccountNumber,
      suppliersReference: raw.SuppliersReference,
      minimumOrderValue: raw.MinimumOrderValue,
    }),
    raw,
  }
}
