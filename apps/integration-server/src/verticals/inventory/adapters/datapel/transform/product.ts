/**
 * Transform a Datapel Breeze `items` record into the canonical Product shape.
 *
 * Field mapping based on the ccBreezeSDK Item domain model:
 *   basestockid      — internal numeric PK (string-coerced for our id)
 *   itemcode         — SKU / item number
 *   itemname         — display name
 *   notes            — description
 *   isactive         — active flag
 *   price / priceinc — sell prices ex/inc tax
 *   buyingunitofmeasure / sellingunitofmeasure
 *   minimumreorderlevel / defaultreorderquantity
 *   primarysuppliercardid / primarysupplieritemcode
 *   customfield1-3, udf1-24 — surfaced in metadata
 *   timeStamp        — last modified
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawDatapelProduct {
  basestockid?: number | string
  itemcode?: string
  itemname?: string
  notes?: string
  isactive?: boolean | string | number
  price?: number | string
  priceinc?: number | string
  taxcode?: string
  taxrate?: number | string
  buyingunitofmeasure?: string
  sellingunitofmeasure?: string
  minimumreorderlevel?: number | string
  defaultreorderquantity?: number | string
  primarysuppliercardid?: number | string
  primarysupplieritemcode?: string
  customfield1?: string
  customfield2?: string
  customfield3?: string
  timeStamp?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawDatapelProduct): Product {
  const id = String(raw.basestockid ?? '')
  const price = pickNum(raw.price)
  const supplierIds: string[] = []
  const suppId = pickStr(raw.primarysuppliercardid)
  if (suppId) supplierIds.push(suppId)

  return {
    id,
    externalId: id,
    sku: pickStr(raw.itemcode) ?? '',
    name: pickStr(raw.itemname) ?? '',
    description: pickStr(raw.notes),
    unitOfMeasure: pickStr(raw.sellingunitofmeasure) ?? pickStr(raw.buyingunitofmeasure) ?? 'each',
    retailPrice:
      price !== undefined
        ? { amount: Math.round(price * 100), currency: 'AUD' }
        : undefined,
    isActive: pickBool(raw.isactive) ?? true,
    supplierIds,
    updatedAt: toIso(raw.timeStamp),
    platform: 'datapel',
    metadata: strMap({
      taxcode: raw.taxcode,
      taxrate: raw.taxrate,
      minimumreorderlevel: raw.minimumreorderlevel,
      defaultreorderquantity: raw.defaultreorderquantity,
      primarysupplieritemcode: raw.primarysupplieritemcode,
      customfield1: raw.customfield1,
      customfield2: raw.customfield2,
      customfield3: raw.customfield3,
    }),
    raw,
  }
}
