/**
 * Transform Boxstorm vendor → canonical Supplier.
 *
 * Boxstorm (Fishbowl Advanced) vendors endpoint: GET /api/vendors
 * Response envelope: { totalCount, totalPages, pageNumber, pageSize, results: RawBoxstormVendor[] }
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawBoxstormVendor {
  /** Numeric primary key */
  id: number | string
  name?: string
  accountNumber?: string
  active?: boolean
  /** Custom fields array (key/value pairs) */
  customFields?: Array<{ name?: string; value?: unknown }>
  [key: string]: unknown
}

export function transformSupplier(raw: RawBoxstormVendor): Supplier {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    isActive: raw.active !== false,
    platform: 'boxstorm',
    metadata: strMap({ accountNumber: raw.accountNumber }),
    raw,
  }
}
