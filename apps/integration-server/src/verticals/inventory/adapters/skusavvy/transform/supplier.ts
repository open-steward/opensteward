import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

/**
 * SKUSavvy GraphQL vendor node.
 * SKUSavvy calls suppliers "vendors".
 */
export interface RawSkusavvyVendor {
  id: string
  name?: string
  email?: string
  phone?: string
  currency?: string
  leadTime?: number
  status?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawSkusavvyVendor): Supplier {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.leadTime),
    isActive: (raw.status ?? '').toLowerCase() !== 'inactive',
    platform: 'skusavvy',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
