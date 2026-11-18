import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

/**
 * Raw product record from GET /products or GET /product/{uid_no}.
 * Fields sourced from SphereWMS API v2.27.0.
 */
export interface RawSphereWmsProduct {
  uid_no: string | number
  product_code?: string
  description_1?: string
  description_2?: string
  upc_code?: string
  product_line?: string
  qty_on_hand?: number
  serial_no_flag?: boolean | string | number
  lot_no_flag?: boolean | string | number
  bin_loc_flag?: boolean | string | number
  fifo_lifo_flag?: boolean | string | number
  client_code?: string
  yes_no_fields_1?: boolean | string | number
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawSphereWmsProduct): Product {
  const uid = String(raw.uid_no)
  return {
    id: uid,
    externalId: uid,
    sku: pickStr(raw.product_code) ?? '',
    name: pickStr(raw.description_1) ?? pickStr(raw.product_code) ?? '',
    description: pickStr(raw.description_2),
    upc: pickStr(raw.upc_code),
    brand: undefined,
    category: pickStr(raw.product_line),
    unitOfMeasure: 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    retailPrice: undefined,
    isActive: true,
    parentProductId: undefined,
    supplierIds: [],
    createdAt: toIso(raw.created_on),
    updatedAt: toIso(raw.updated_on),
    platform: 'spherewms',
    metadata: strMap({
      clientCode: raw.client_code,
      serialNoFlag: raw.serial_no_flag,
      lotNoFlag: raw.lot_no_flag,
      binLocFlag: raw.bin_loc_flag,
      fifoLifoFlag: raw.fifo_lifo_flag,
    }),
    raw,
  }
}
