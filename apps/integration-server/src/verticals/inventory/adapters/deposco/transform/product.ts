/**
 * Transform a Deposco WMS item record into the canonical Product shape.
 *
 * Endpoint: GET /items  or  GET /items/{itemNumber}
 * Response container: { item: RawDeposcoItem[] } for list; single object for GET-by-id.
 *
 * Field notes:
 *   itemNumber        — primary key (is also the SKU)
 *   description       — human-readable name
 *   description2      — secondary / extended description
 *   upc               — UPC barcode
 *   vendorNumber      — default vendor/supplier ID
 *   vendorName        — default vendor/supplier display name
 *   weight            — weight value (unit in weightUom, default lbs)
 *   weightUom         — LB | KG etc.
 *   length/width/height — dimensions (unit in dimensionUom, default IN)
 *   price             — list/retail unit price
 *   category          — product category
 *   productLine       — product line (used as brand)
 *   active            — 'Y'/'N' or boolean
 *   createdDate / lastModifiedDate — ISO timestamps
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawDeposcoItem {
  itemNumber: string
  description?: string
  description2?: string
  upc?: string
  vendorNumber?: string
  vendorName?: string
  weight?: number | string
  weightUom?: string
  length?: number | string
  width?: number | string
  height?: number | string
  dimensionUom?: string
  price?: number | string
  category?: string
  productLine?: string
  active?: boolean | string
  createdDate?: string
  lastModifiedDate?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawDeposcoItem): Product {
  const weightVal = pickNum(raw.weight)
  const weightUom = (raw.weightUom ?? 'LB').toUpperCase()
  // Normalize to grams: LB -> 453.592 g, KG -> 1000 g, OZ -> 28.3495 g
  let weightGrams: number | undefined
  if (weightVal !== undefined) {
    if (weightUom === 'KG') weightGrams = weightVal * 1000
    else if (weightUom === 'OZ') weightGrams = weightVal * 28.3495
    else weightGrams = weightVal * 453.592 // default: LB
  }

  const dimUom = (raw.dimensionUom ?? 'IN').toUpperCase()
  // Normalize to cm: IN -> 2.54 cm, CM stays, MM -> 0.1 cm
  const dimFactor = dimUom === 'CM' ? 1 : dimUom === 'MM' ? 0.1 : 2.54 // default IN
  const len = pickNum(raw.length)
  const wid = pickNum(raw.width)
  const ht = pickNum(raw.height)

  const supplierIds: string[] = []
  if (raw.vendorNumber) supplierIds.push(String(raw.vendorNumber))

  return {
    id: raw.itemNumber,
    externalId: raw.itemNumber,
    sku: raw.itemNumber,
    name: pickStr(raw.description) ?? raw.itemNumber,
    description: pickStr(raw.description2),
    upc: pickStr(raw.upc),
    brand: pickStr(raw.productLine),
    category: pickStr(raw.category),
    unitOfMeasure: 'each',
    weightGrams,
    dimensionsCm:
      len !== undefined || wid !== undefined || ht !== undefined
        ? {
            length: len !== undefined ? len * dimFactor : undefined,
            width: wid !== undefined ? wid * dimFactor : undefined,
            height: ht !== undefined ? ht * dimFactor : undefined,
          }
        : undefined,
    retailPrice:
      raw.price !== undefined
        ? { amount: pickNum(raw.price) ?? 0, currency: 'USD' }
        : undefined,
    isActive: pickBool(raw.active) ?? true,
    supplierIds,
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.lastModifiedDate),
    platform: 'deposco',
    metadata: strMap({
      vendorName: raw.vendorName,
      weightUom: raw.weightUom,
      dimensionUom: raw.dimensionUom,
    }),
    raw,
  }
}
