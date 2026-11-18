import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

/**
 * Shape returned by GET /api/Suppliers and GET /api/SuppliersBulk.
 *
 * Official StockTrim SupplierResponseDto field names:
 *   supplierCode — unique code for the supplier
 *   supplierName — display name
 */
export interface RawStockTrimSupplier {
  supplierCode: string
  supplierName?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawStockTrimSupplier): Supplier {
  return {
    id: raw.supplierCode,
    externalId: raw.supplierCode,
    name: pickStr(raw.supplierName) ?? raw.supplierCode,
    isActive: true,
    platform: 'stocktrim',
    metadata: strMap({}),
    raw,
  }
}
