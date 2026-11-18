/**
 * Manhattan Active WM — supplier transform.
 *
 * WM REST endpoint: GET /wm/v1/suppliers  |  GET /wm/v1/suppliers/{supplierId}
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawManhattanActiveSupplier {
  supplierId: string
  supplierName?: string
  supplierCode?: string
  email?: string
  phone?: string
  currency?: string
  /** Default lead time in days. */
  leadTimeDays?: number
  status?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawManhattanActiveSupplier): Supplier {
  return {
    id: raw.supplierId,
    externalId: raw.supplierId,
    name: pickStr(raw.supplierName) ?? pickStr(raw.supplierCode) ?? raw.supplierId,
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.leadTimeDays),
    isActive: (raw.status ?? '').toUpperCase() !== 'INACTIVE',
    platform: 'manhattan-active',
    metadata: strMap({ supplierCode: raw.supplierCode, status: raw.status }),
    raw,
  }
}
