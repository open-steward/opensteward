import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, pickBool, strMap} from './shared'

/**
 * Raw vendor/supplier record from the SkuNexus REST API.
 * SkuNexus refers to suppliers as "vendors" internally.
 * Endpoint: GET /api/v1/vendors  (list) / GET /api/v1/vendors/:id (single)
 */
export interface RawSkuNexusSupplier {
  id: string | number
  name?: string
  email?: string
  phone?: string
  currency?: string
  lead_time_days?: number | string
  status?: string
  active?: boolean | string
  archived?: boolean | string
  [key: string]: unknown
}

export function transformSupplier(raw: RawSkuNexusSupplier): Supplier {
  const id = String(raw.id)
  const status = (raw.status ?? '').toLowerCase()
  const isActive = raw.archived != null
    ? !(pickBool(raw.archived) ?? false)
    : raw.active != null
      ? (pickBool(raw.active) ?? true)
      : status !== 'inactive' && status !== 'disabled'

  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.lead_time_days),
    isActive,
    platform: 'skunexus',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
