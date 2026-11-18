/**
 * Transform Sage X3 ITMMASTER representation to canonical Product.
 *
 * Key ITMMASTER fields:
 *   ITMREF    — product reference / SKU (primary key)
 *   ITMDES1   — description line 1
 *   ITMDES2   — description line 2
 *   TCLCOD    — product category code
 *   TSICOD    — statistical sub-group
 *   ITMSTA    — product status (1=Active, 2=Inactive, 3=Obsolete)
 *   STU       — stock unit of measure
 *   ITMWEI    — item weight (kg by default in X3)
 *   EANCOD    — EAN barcode
 *   GTIN      — GTIN barcode
 *   BPSNUM    — default supplier code
 *   BRDCOD    — brand code
 *   CREDAT    — creation date
 *   UPDDAT    — last update date
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

export interface RawSageX3Product {
  /** Product reference (SKU) — primary key */
  ITMREF?: string
  ITMDES1?: string
  ITMDES2?: string
  ITMDES3?: string
  /** Product category */
  TCLCOD?: string
  /** Statistical group */
  TSICOD?: string
  /** Product status: '1'=Active, '2'=Inactive, '3'=Obsolete */
  ITMSTA?: string | number
  /** Stock unit of measure */
  STU?: string
  /** Item weight in kg */
  ITMWEI?: number | string
  /** EAN / UPC barcode */
  EANCOD?: string
  GTIN?: string
  /** Default supplier business partner number */
  BPSNUM?: string
  /** Brand code */
  BRDCOD?: string
  CREDAT?: string
  UPDDAT?: string
  /** Purchased flag Y/N */
  PURFLG?: string | number
  /** Stocked flag Y/N */
  STOFLG?: string | number
  [key: string]: unknown
}

function isActive(itmsta: unknown): boolean {
  const v = String(itmsta ?? '1').trim()
  // 1 = Normal/Active; anything else (2=Inactive, 3=Obsolete) is not active
  return v === '1' || v === '' || v.toUpperCase() === 'A' || v.toUpperCase() === 'ACTIVE'
}

export function transformProduct(raw: RawSageX3Product): Product {
  const supplierIds: string[] = []
  if (raw.BPSNUM) supplierIds.push(String(raw.BPSNUM))

  const sku = pickStr(raw.ITMREF) ?? ''
  const name = pickStr(raw.ITMDES1) ?? sku
  const desc2 = pickStr(raw.ITMDES2)
  const desc3 = pickStr(raw.ITMDES3)
  const descParts = [pickStr(raw.ITMDES1), desc2, desc3].filter(Boolean)
  const description = descParts.length > 1 ? descParts.join('\n') : undefined

  const rawWeight = raw.ITMWEI !== undefined ? Number(raw.ITMWEI) : undefined
  const weightGrams =
    rawWeight !== undefined && !Number.isNaN(rawWeight)
      ? Math.round(rawWeight * 1000) // kg → grams
      : undefined

  return {
    id: sku,
    externalId: sku,
    sku,
    name,
    description,
    upc: pickStr(raw.EANCOD) ?? pickStr(raw.GTIN),
    brand: pickStr(raw.BRDCOD),
    category: pickStr(raw.TCLCOD),
    unitOfMeasure: pickStr(raw.STU) ?? 'each',
    weightGrams,
    isActive: isActive(raw.ITMSTA),
    supplierIds,
    createdAt: toIso(raw.CREDAT),
    updatedAt: toIso(raw.UPDDAT),
    platform: 'sage-x3-inventory',
    metadata: strMap({
      tclcod: raw.TCLCOD,
      tsicod: raw.TSICOD,
      itmsta: raw.ITMSTA,
      purflg: raw.PURFLG,
      stoflg: raw.STOFLG,
    }),
    raw,
  }
}
