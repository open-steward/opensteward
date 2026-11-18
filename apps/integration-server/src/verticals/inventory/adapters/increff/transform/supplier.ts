/**
 * Increff supplier (vendor) transform.
 *
 * Increff identifies suppliers by a supplierCode. Supplier master objects
 * carry name, contact details, and default currency.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawIncreffSupplier {
  /** Unique supplier code */
  supplierCode: string
  name?: string
  email?: string
  phone?: string
  currency?: string
  /** Lead time in days */
  leadTimeDays?: number
  status?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawIncreffSupplier): Supplier {
  return {
    id: raw.supplierCode,
    externalId: raw.supplierCode,
    name: pickStr(raw.name) ?? raw.supplierCode,
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.leadTimeDays),
    isActive: (raw.status ?? '').toLowerCase() !== 'inactive',
    platform: 'increff',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
