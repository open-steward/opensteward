/**
 * Transform Crunchtime Vendor → canonical Supplier.
 *
 * Source: GET /vendor/v1/getAllVendors
 *
 * Key Crunchtime field names:
 *   vendorCode, vendorName, activeFlag, createDate, lastEditDate
 *
 * Note: Crunchtime vendors are thin records — email, phone, and lead time
 * are not exposed in the getAllVendors response; they are stored in the
 * Vendor Location configuration per location.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawCrunchtimeVendor {
  vendorCode: string
  vendorName?: string
  activeFlag?: boolean | string
  createDate?: string
  lastEditDate?: string
  lastEditUser?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawCrunchtimeVendor): Supplier {
  return {
    id: raw.vendorCode,
    externalId: raw.vendorCode,
    name: pickStr(raw.vendorName) ?? raw.vendorCode,
    isActive: pickBool(raw.activeFlag) ?? true,
    platform: 'crunchtime',
    metadata: strMap({
      lastEditUser: raw.lastEditUser,
      createDate: raw.createDate ? toIso(raw.createDate) ?? raw.createDate : undefined,
      lastEditDate: raw.lastEditDate ? toIso(raw.lastEditDate) ?? raw.lastEditDate : undefined,
    }),
    raw,
  }
}
