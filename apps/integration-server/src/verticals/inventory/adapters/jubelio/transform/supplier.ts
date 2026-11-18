/**
 * Jubelio supplier (vendor/contact) transform.
 *
 * GET /contacts/suppliers/   → {data: RawJubelioSupplier[], count: number}
 * GET /contacts/{id}         → RawJubelioSupplier
 *
 * Jubelio contacts store both customers and suppliers; the suppliers endpoint
 * filters to vendors only. Field names sourced from the contacts API.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawJubelioSupplier {
  contact_id: number | string
  contact_name?: string
  email?: string
  phone?: string
  currency?: string
  is_active?: boolean | number | string
  status?: string
  credit_term?: number | string
  [key: string]: unknown
}

export function transformSupplier(raw: RawJubelioSupplier): Supplier {
  const id = String(raw.contact_id)
  const statusStr = pickStr(raw.status) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.contact_name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.credit_term),
    isActive: statusStr.toLowerCase() !== 'inactive',
    platform: 'jubelio',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
