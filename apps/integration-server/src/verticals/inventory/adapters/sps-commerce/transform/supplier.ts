/**
 * SPS Commerce vendor/supplier transform.
 *
 * Wire field names follow SPS Commerce REST API standards (snake_case).
 * Reference: GET /fulfillment/v1/vendors
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawSpsCommerceSupplier {
  /** SPS internal vendor identifier */
  vendor_id: string
  /** Vendor name */
  vendor_name?: string
  /** Vendor contact email */
  email?: string
  /** Vendor contact phone */
  phone?: string
  /** Default currency (ISO 4217) */
  currency_code?: string
  /** Default lead time in days */
  lead_time_days?: number
  /** Vendor status (ACTIVE, INACTIVE, etc.) */
  status?: string
  /** SPS Trading Partner ID */
  trading_partner_id?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawSpsCommerceSupplier): Supplier {
  return {
    id: raw.vendor_id,
    externalId: raw.vendor_id,
    name: pickStr(raw.vendor_name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency_code),
    defaultLeadTimeDays: pickNum(raw.lead_time_days),
    isActive: (raw.status ?? '').toUpperCase() !== 'INACTIVE',
    platform: 'sps-commerce',
    metadata: strMap({
      status: raw.status,
      tradingPartnerId: raw.trading_partner_id,
    }),
    raw,
  }
}
