/**
 * Transform D365 SCM VendorsV2 OData entity → canonical Supplier.
 *
 * OData entity: VendorsV2
 * Key fields:
 *   VendorAccountNumber  — primary key
 *   VendorName           — display name
 *   VendorGroupId        — group / category
 *   CurrencyCode         — default currency
 *   VendorHoldStatus     — "None" | "Invoice" | "All" | "Vendor" | "Payment" | "Requisition"
 *   Email                — primary email contact
 *   PhoneNumber          — primary phone
 *   DataAreaId           — legal entity
 *   DeliveryTermsId      — delivery terms (e.g. "FOB")
 *   PaymentTermsId       — payment terms
 *   DefaultLeadTimeDays  — lead-time in days (if configured)
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawD365Vendor {
  VendorAccountNumber: string
  VendorName?: string
  VendorGroupId?: string
  CurrencyCode?: string
  VendorHoldStatus?: string
  Email?: string
  PhoneNumber?: string
  DataAreaId?: string
  DeliveryTermsId?: string
  PaymentTermsId?: string
  DefaultLeadTimeDays?: number | string
  [key: string]: unknown
}

export function transformSupplier(raw: RawD365Vendor): Supplier {
  // Vendor is inactive only when hold status encompasses all transactions
  const holdStatus = (raw.VendorHoldStatus ?? 'None').toLowerCase()
  const isActive = holdStatus !== 'all' && holdStatus !== 'vendor'

  return {
    id: raw.VendorAccountNumber,
    externalId: raw.VendorAccountNumber,
    name: pickStr(raw.VendorName) ?? raw.VendorAccountNumber,
    email: pickStr(raw.Email),
    phone: pickStr(raw.PhoneNumber),
    defaultCurrency: pickStr(raw.CurrencyCode),
    defaultLeadTimeDays: pickNum(raw.DefaultLeadTimeDays),
    isActive,
    platform: 'dynamics-365-scm',
    metadata: strMap({
      vendorGroupId: raw.VendorGroupId,
      dataAreaId: raw.DataAreaId,
      holdStatus: raw.VendorHoldStatus,
      deliveryTermsId: raw.DeliveryTermsId,
      paymentTermsId: raw.PaymentTermsId,
    }),
    raw,
  }
}
