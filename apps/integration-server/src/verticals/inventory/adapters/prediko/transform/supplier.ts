import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

/**
 * Raw supplier object returned by GET /api/v1/suppliers.
 */
export interface RawPredikoSupplier {
  id: string
  name?: string
  emails?: string[] | null
  currency?: string
  lead_time?: number
  minimum_order_quantity?: number
  minimum_order_type?: string
  address?: {
    address1?: string
    address2?: string
    city?: string
    province?: string
    country?: string
    zip?: string
  }
  [key: string]: unknown
}

export function transformSupplier(raw: RawPredikoSupplier): Supplier {
  const emails = Array.isArray(raw.emails) ? raw.emails : []
  const firstEmail = emails[0] ?? undefined

  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    email: firstEmail ? pickStr(firstEmail) : undefined,
    phone: undefined,
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.lead_time),
    isActive: true,
    platform: 'prediko',
    metadata: strMap({
      minimumOrderQuantity: raw.minimum_order_quantity,
      minimumOrderType: raw.minimum_order_type,
    }),
    raw,
  }
}
