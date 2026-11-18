/**
 * Transform ECCANG supplier (供应商) records to the canonical Supplier schema.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawEccangSupplier {
  supplier_id?: string | number
  supplier_code?: string
  supplier_name?: string
  contact_email?: string
  contact_phone?: string
  currency?: string
  lead_time?: number | string
  status?: string | number
  country?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawEccangSupplier): Supplier {
  const id = String(raw.supplier_id ?? raw.supplier_code ?? '')
  const statusStr = String(raw.status ?? '').toLowerCase()
  return {
    id,
    externalId: id,
    name: pickStr(raw.supplier_name) ?? '',
    email: pickStr(raw.contact_email),
    phone: pickStr(raw.contact_phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.lead_time),
    isActive: statusStr !== 'inactive' && statusStr !== '0' && statusStr !== 'disabled',
    platform: 'eccang',
    metadata: strMap({ status: raw.status, country: raw.country, supplierCode: raw.supplier_code }),
    raw,
  }
}
