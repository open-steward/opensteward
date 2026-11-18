/**
 * Versa Cloud ERP — supplier (vendor) transform.
 *
 * API endpoint: GET /vendor.json
 * Key response fields:
 *   id, vendor_name, email, phone, currency,
 *   lead_time_days, is_active, created_at, updated_at
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, pickBool, strMap} from './shared'

export interface RawVersaSupplier {
  id: string | number
  vendor_name?: string
  email?: string
  phone?: string
  currency?: string
  lead_time_days?: number | string
  is_active?: boolean | number | string
  [key: string]: unknown
}

export function transformSupplier(raw: RawVersaSupplier): Supplier {
  const id = String(raw.id)

  return {
    id,
    externalId: id,
    name: pickStr(raw.vendor_name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.lead_time_days),
    isActive: pickBool(raw.is_active) ?? true,
    platform: 'versa-cloud-erp',
    metadata: strMap({}),
    raw,
  }
}
