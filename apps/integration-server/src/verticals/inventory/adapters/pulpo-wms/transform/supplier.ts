import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

/**
 * Raw supplier record from GET /api/v1/suppliers (PULPO WMS).
 */
export interface RawPulpoWmsSupplier {
  id: string
  name?: string
  email?: string
  phone?: string
  currency?: string
  lead_time_days?: number
  status?: string
  is_active?: boolean | string
  [key: string]: unknown
}

export function transformSupplier(raw: RawPulpoWmsSupplier): Supplier {
  const status = pickStr(raw.status)
  const isActive = typeof raw.is_active === 'boolean'
    ? raw.is_active
    : (status ?? '').toLowerCase() !== 'inactive'
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.lead_time_days),
    isActive,
    platform: 'pulpo-wms',
    metadata: strMap({ status }),
    raw,
  }
}
