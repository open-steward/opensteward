/**
 * Transform Wasp InventoryCloud vendor → canonical Supplier.
 *
 * InventoryCloud vendor fields (from vendors/getvendorbynumber / advancedinfosearch):
 *   VendorNumber  — primary identifier (string)
 *   VendorName    — display name
 *   Email         — contact email
 *   Phone         — phone number (from separate phones endpoint, may be embedded)
 *   IsActive      — active/inactive flag
 *   AccountNumber — vendor account reference
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickBool, strMap} from './shared'

export interface RawWaspBarcodeSupplier {
  VendorNumber?: string
  VendorName?: string
  Email?: string
  Phone?: string
  IsActive?: boolean | string | number
  AccountNumber?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawWaspBarcodeSupplier): Supplier {
  const id = pickStr(raw.VendorNumber) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.VendorName) ?? '',
    email: pickStr(raw.Email),
    phone: pickStr(raw.Phone),
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    isActive: pickBool(raw.IsActive) ?? true,
    platform: 'wasp-barcode',
    metadata: strMap({ accountNumber: raw.AccountNumber }),
    raw,
  }
}
