/**
 * Transform a Deposco WMS vendor/supplier record into the canonical Supplier shape.
 *
 * Endpoint: GET /vendors  or  GET /vendors/{vendorNumber}
 *
 * Field notes:
 *   vendorNumber      — primary key
 *   vendorName        — display name
 *   email             — contact email
 *   phone             — contact phone
 *   currency          — default transaction currency
 *   leadTime          — typical lead time in days
 *   active            — 'Y'/'N' or boolean
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, pickBool, strMap} from './shared'

export interface RawDeposcoVendor {
  vendorNumber: string
  vendorName?: string
  email?: string
  phone?: string
  currency?: string
  leadTime?: number | string
  active?: boolean | string
  [key: string]: unknown
}

export function transformSupplier(raw: RawDeposcoVendor): Supplier {
  return {
    id: raw.vendorNumber,
    externalId: raw.vendorNumber,
    name: pickStr(raw.vendorName) ?? raw.vendorNumber,
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.leadTime),
    isActive: pickBool(raw.active) ?? true,
    platform: 'deposco',
    metadata: strMap({}),
    raw,
  }
}
