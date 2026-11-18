/**
 * Transform Epicor Kinetic Part (PartSvc/Parts) → canonical Product.
 *
 * Key Epicor fields (REST v2 PartSvc):
 *   PartNum           — primary key / SKU
 *   PartDescription   — display name
 *   ClassID           — product classification
 *   IUM               — inventory unit of measure
 *   NetWeight         — net weight in the WeightUOM unit
 *   WeightUOM         — weight unit ("LB", "KG", etc.)
 *   UnitPrice         — list / sell price
 *   CostMethod        — FIFO | LIFO | AVG | STD | LOT
 *   InActive          — boolean; true = inactive
 *   TrackSerialNum    — serialised tracking flag
 *   TrackLots         — lot tracking flag
 *   ParentPartNum     — variant parent
 *   SysRowID          — stable GUID row identifier
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawEpicorKineticPart {
  PartNum: string
  PartDescription?: string
  ClassID?: string
  IUM?: string
  NetWeight?: number
  WeightUOM?: string
  UnitPrice?: number
  CostMethod?: string
  InActive?: boolean | string
  TrackSerialNum?: boolean
  TrackLots?: boolean
  ParentPartNum?: string
  SysRowID?: string
  CreatedOn?: string
  ChangedOn?: string
  [key: string]: unknown
}

/** Convert Epicor weight to grams (canonical unit). */
function toGrams(weight: number | undefined, uom: string | undefined): number | undefined {
  if (weight === undefined) return undefined
  const u = (uom ?? 'LB').toUpperCase()
  if (u === 'KG') return weight * 1000
  if (u === 'G' || u === 'GM') return weight
  // Default: pounds
  return weight * 453.592
}

export function transformProduct(raw: RawEpicorKineticPart): Product {
  const isActive = !(pickBool(raw.InActive) ?? false)
  return {
    id:              raw.PartNum,
    externalId:      raw.SysRowID ?? raw.PartNum,
    sku:             raw.PartNum,
    name:            pickStr(raw.PartDescription) ?? raw.PartNum,
    description:     undefined,
    upc:             undefined,
    brand:           undefined,
    category:        pickStr(raw.ClassID),
    unitOfMeasure:   pickStr(raw.IUM) ?? 'each',
    weightGrams:     toGrams(raw.NetWeight, raw.WeightUOM),
    dimensionsCm:    undefined,
    retailPrice:     raw.UnitPrice !== undefined
      ? { amount: raw.UnitPrice, currency: 'USD' }
      : undefined,
    isActive,
    parentProductId: pickStr(raw.ParentPartNum),
    supplierIds:     [],
    createdAt:       toIso(raw.CreatedOn),
    updatedAt:       toIso(raw.ChangedOn),
    platform:        'epicor-kinetic',
    metadata:        strMap({
      classID:     raw.ClassID,
      costMethod:  raw.CostMethod,
      trackSerial: raw.TrackSerialNum,
      trackLots:   raw.TrackLots,
    }),
    raw,
  }
}
