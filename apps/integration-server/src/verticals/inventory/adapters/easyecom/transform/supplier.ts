import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

/**
 * EasyEcom vendor/supplier record.
 * Fields sourced from EasyEcom API /vendor/getVendors response.
 */
export interface RawEasyEcomSupplier {
  vendor_id: string | number
  vendor_name?: string
  vendor_email?: string
  vendor_phone?: string
  currency?: string
  lead_time?: number | string
  status?: string
  is_active?: boolean | string | number
  [key: string]: unknown
}

export function transformSupplier(raw: RawEasyEcomSupplier): Supplier {
  const id = String(raw.vendor_id)
  const status = pickStr(raw.status) ?? ''
  const isActive = typeof raw.is_active !== 'undefined'
    ? raw.is_active === true || raw.is_active === 1 || raw.is_active === '1'
    : status.toLowerCase() !== 'inactive'

  return {
    id,
    externalId: id,
    name: pickStr(raw.vendor_name) ?? '',
    email: pickStr(raw.vendor_email),
    phone: pickStr(raw.vendor_phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.lead_time),
    isActive,
    platform: 'easyecom',
    metadata: strMap({ status }),
    raw,
  }
}
