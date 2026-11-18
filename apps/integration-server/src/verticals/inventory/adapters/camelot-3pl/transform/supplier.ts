import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

/**
 * Camelot 3PL / Excalibur WMS — vendor/supplier record.
 *
 * Returned by the /vendors endpoint.
 */
export interface RawCamelot3plSupplier {
  vendorId: string
  vendorName?: string
  contactEmail?: string
  contactPhone?: string
  currency?: string
  leadTimeDays?: number
  isActive?: boolean | string | number
  [key: string]: unknown
}

export function transformSupplier(raw: RawCamelot3plSupplier): Supplier {
  let isActive = true
  if (raw.isActive !== undefined) {
    isActive = raw.isActive === true || raw.isActive === 1 || raw.isActive === '1' ||
               String(raw.isActive).toLowerCase() === 'true' ||
               String(raw.isActive).toLowerCase() === 'y'
  }
  return {
    id: String(raw.vendorId),
    externalId: String(raw.vendorId),
    name: pickStr(raw.vendorName) ?? '',
    email: pickStr(raw.contactEmail),
    phone: pickStr(raw.contactPhone),
    defaultCurrency: pickStr(raw.currency),
    defaultLeadTimeDays: pickNum(raw.leadTimeDays),
    isActive,
    platform: 'camelot-3pl',
    metadata: strMap({}),
    raw,
  }
}
