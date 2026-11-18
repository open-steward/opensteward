/**
 * Transform Epicor Kinetic Vendor (VendorSvc/Vendors) → canonical Supplier.
 *
 * Key Epicor fields (REST v2 VendorSvc):
 *   VendorNum     — internal numeric ID (primary key)
 *   VendorID      — human-readable vendor code
 *   Name          — vendor display name
 *   EMailAddress  — primary contact email
 *   PhoneNum      — phone number
 *   CurrencyCode  — default currency
 *   Inactive      — boolean; true = inactive
 *   TermsCode     — payment terms
 *   SysRowID      — stable GUID row identifier
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawEpicorKineticVendor {
  VendorNum: number
  VendorID?: string
  Name?: string
  EMailAddress?: string
  PhoneNum?: string
  CurrencyCode?: string
  Inactive?: boolean
  TermsCode?: string
  SysRowID?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawEpicorKineticVendor): Supplier {
  return {
    id:                  String(raw.VendorNum),
    externalId:          raw.SysRowID ?? String(raw.VendorNum),
    name:                pickStr(raw.Name) ?? pickStr(raw.VendorID) ?? String(raw.VendorNum),
    email:               pickStr(raw.EMailAddress),
    phone:               pickStr(raw.PhoneNum),
    defaultCurrency:     pickStr(raw.CurrencyCode),
    defaultLeadTimeDays: undefined,
    isActive:            !(raw.Inactive ?? false),
    platform:            'epicor-kinetic',
    metadata:            strMap({
      vendorID:   raw.VendorID,
      termsCode:  raw.TermsCode,
    }),
    raw,
  }
}
