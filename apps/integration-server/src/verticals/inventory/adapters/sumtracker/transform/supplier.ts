import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

/**
 * Sumtracker supplier object as returned by GET /suppliers or GET /suppliers/:id.
 */
export interface RawSumtrackerSupplier {
  id: string | number
  name?: string
  email?: string
  phone?: string
  currency?: string
  lead_time?: number | string
  status?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawSumtrackerSupplier): Supplier {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.lead_time),
    isActive: (raw.status ?? '').toLowerCase() !== 'inactive',
    platform: 'sumtracker',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
