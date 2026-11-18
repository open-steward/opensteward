/**
 * Transform a raw Jushuitan supplier record (/open/supplier/query) into a
 * canonical Supplier.
 *
 * Jushuitan field reference:
 *   supplier_id    — numeric supplier ID
 *   supplier_name  — display name
 *   contact        — contact person name
 *   mobile         — mobile/phone number
 *   email          — email address
 *   enabled        — 1 = active
 *   currency       — default settlement currency code
 *   lead_time      — default lead time in days
 *   created        — creation datetime
 *   modified       — last-modified datetime
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, pickBool, strMap} from './shared'

export interface RawJushuitanSupplier {
  supplier_id: number | string
  supplier_name?: string
  contact?: string
  mobile?: string
  email?: string
  enabled?: number | string | boolean
  currency?: string
  lead_time?: number | string
  created?: string
  modified?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawJushuitanSupplier): Supplier {
  const id = String(raw.supplier_id)

  return {
    id,
    externalId: id,
    name: pickStr(raw.supplier_name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.mobile),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.lead_time),
    isActive: pickBool(raw.enabled) ?? true,
    platform: 'jushuitan',
    metadata: strMap({ contact: raw.contact }),
    raw,
  }
}
