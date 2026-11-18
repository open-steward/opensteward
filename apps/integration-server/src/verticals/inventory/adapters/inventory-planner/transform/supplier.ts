/**
 * Transform an Inventory Planner vendor record into the canonical Supplier schema.
 *
 * Vendors are available from:
 *   GET /api/v1/vendors          (top-level list — if supported)
 *   GET /api/v1/variants/{id}/vendors  (per-variant vendor link)
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawInventoryPlannerVendor {
  _id: string
  name?: string
  email?: string
  phone?: string
  currency?: string
  /** Lead time in days */
  lead_time?: number
  /** Minimum order quantity */
  moq?: number
  /** Whether this vendor is active */
  active?: boolean
  [key: string]: unknown
}

export function transformSupplier(raw: RawInventoryPlannerVendor): Supplier {
  return {
    id: raw._id,
    externalId: raw._id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.lead_time),
    isActive: raw.active !== false,
    platform: 'inventory-planner',
    metadata: strMap({ moq: raw.moq }),
    raw,
  }
}
