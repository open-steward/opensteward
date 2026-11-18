/**
 * Da Vinci Unified — vendor/supplier transform.
 *
 * DVU calls these "vendors". API endpoint: /api/vendor/vendors.
 * Key fields: vendorId, vendorName, email, phone, currencyCode,
 * leadTimeDays, isActive.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, pickBool, strMap} from './shared'

export interface RawDaVinciUnifiedSupplier {
  vendorId: string
  vendorName?: string
  email?: string
  phone?: string
  currencyCode?: string
  leadTimeDays?: number
  isActive?: boolean | string
  [key: string]: unknown
}

export function transformSupplier(raw: RawDaVinciUnifiedSupplier): Supplier {
  return {
    id: raw.vendorId,
    externalId: raw.vendorId,
    name: pickStr(raw.vendorName) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currencyCode),
    defaultLeadTimeDays: pickNum(raw.leadTimeDays),
    isActive: pickBool(raw.isActive) ?? true,
    platform: 'da-vinci-unified',
    metadata: strMap({}),
    raw,
  }
}
