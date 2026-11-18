import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawSkulabsItem {
  _id: string
  sku?: string
  name?: string
  upc?: string
  weight?: number
  length?: number
  width?: number
  height?: number
  weight_unit?: string
  dimensions_unit?: string
  cost?: number
  wholesale?: number
  retail?: number
  active?: boolean
  custom_fields?: Array<{ key: string; value: unknown }>
  barcodes?: string[]
  tags?: string[]
  supplies?: Array<{ distributor_id: string }>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function weightToGrams(weight: number | undefined, unit: string | undefined): number | undefined {
  if (weight === undefined) return undefined
  switch ((unit ?? 'oz').toLowerCase()) {
    case 'lb': return weight * 453.592
    case 'kg': return weight * 1000
    case 'g': return weight
    case 'oz':
    default: return weight * 28.3495
  }
}

function dimToCm(v: number | undefined, unit: string | undefined): number | undefined {
  if (v === undefined) return undefined
  return (unit ?? 'in').toLowerCase() === 'cm' ? v : v * 2.54
}

export function transformProduct(raw: RawSkulabsItem): Product {
  const supplierIds: string[] = (raw.supplies ?? [])
    .map((s) => pickStr(s.distributor_id))
    .filter((id): id is string => id !== undefined)

  const dimUnit = raw.dimensions_unit
  const hasDims = raw.length !== undefined || raw.width !== undefined || raw.height !== undefined

  return {
    id: raw._id,
    externalId: raw._id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.name) ?? '',
    upc: pickStr(raw.upc) ?? (raw.barcodes?.[0] ? pickStr(raw.barcodes[0]) : undefined),
    unitOfMeasure: 'each',
    weightGrams: weightToGrams(pickNum(raw.weight), raw.weight_unit),
    dimensionsCm: hasDims ? {
      length: dimToCm(pickNum(raw.length), dimUnit),
      width: dimToCm(pickNum(raw.width), dimUnit),
      height: dimToCm(pickNum(raw.height), dimUnit),
    } : undefined,
    retailPrice: raw.retail !== undefined ? { amount: Math.round((raw.retail as number) * 100), currency: 'USD' } : undefined,
    isActive: pickBool(raw.active) ?? true,
    supplierIds,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'skulabs',
    metadata: strMap({ weightUnit: raw.weight_unit, dimensionsUnit: raw.dimensions_unit }),
    raw,
  }
}
