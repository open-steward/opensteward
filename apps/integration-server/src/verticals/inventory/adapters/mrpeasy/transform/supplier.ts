import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

/**
 * Raw vendor shape from GET /vendors and GET /vendors/{id}.
 * Field names sourced from MRPeasy REST API v1 documentation.
 * Note: vendors are read-only in MRPeasy — only GET is supported.
 */
export interface RawMrpeasySupplier {
  vendor_id: number | string
  code?: string
  title?: string
  email?: string
  phone?: string
  currency?: string
  lead_time?: number | string
  url?: string
  address?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawMrpeasySupplier): Supplier {
  const id = String(raw.vendor_id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.title) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.lead_time),
    isActive: true,
    platform: 'mrpeasy',
    metadata: strMap({ code: raw.code, url: raw.url, address: raw.address }),
    raw,
  }
}
