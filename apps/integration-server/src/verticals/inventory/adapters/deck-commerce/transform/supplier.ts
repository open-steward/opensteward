/**
 * Deck Commerce does not expose a supplier/vendor REST endpoint in its OMS API.
 * Supplier data is managed in the upstream ERP or purchasing system.
 *
 * This transform handles any vendor-like data that may appear in future API
 * responses or custom extensions.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawDeckCommerceSupplier {
  SupplierID?: string
  VendorID?: string
  SupplierName?: string
  VendorName?: string
  Email?: string
  Phone?: string
  Currency?: string
  LeadTimeDays?: number
  Status?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawDeckCommerceSupplier): Supplier {
  const id = pickStr(raw.SupplierID ?? raw.VendorID) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.SupplierName ?? raw.VendorName) ?? '',
    email: pickStr(raw.Email),
    phone: pickStr(raw.Phone),
    defaultCurrency: pickStr(raw.Currency),
    defaultLeadTimeDays: pickNum(raw.LeadTimeDays),
    isActive: (raw.Status ?? '').toLowerCase() !== 'inactive',
    platform: 'deck-commerce',
    metadata: strMap({ status: raw.Status }),
    raw,
  }
}
