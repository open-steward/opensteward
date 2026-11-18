/**
 * Oracle WMS Cloud — item entity → Product
 *
 * lgfapi endpoint: GET /wms/lgfapi/v10/entity/item/
 *
 * Key item fields (from WMS Cloud item master):
 *   item_id                — internal integer PK
 *   item_number            — customer-visible item number / SKU
 *   description            — item description
 *   std_uom                — standard unit of measure code
 *   item_type              — item type code
 *   unit_weight            — weight per unit (numeric string)
 *   weight_uom             — weight UOM (e.g. "LB", "KG")
 *   unit_length / unit_width / unit_height  — dimensions
 *   dim_uom                — dimension UOM (e.g. "IN", "CM")
 *   default_vendor_id      — FK to vendor (supplier)
 *   status                 — "Active" / "Inactive"
 *   created_date_time
 *   last_updated_date_time
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawOracleWmsItem {
  item_id: number | string
  item_number?: string
  description?: string
  std_uom?: string
  std_uom_id?: number | string
  item_type?: string
  item_type_id?: number | string
  unit_weight?: number | string
  weight_uom?: string
  unit_length?: number | string
  unit_width?: number | string
  unit_height?: number | string
  dim_uom?: string
  default_vendor_id?: number | string
  status?: string
  company_id?: number | string
  created_date_time?: string
  last_updated_date_time?: string
  [key: string]: unknown
}

/** Convert weight in given UOM to grams. */
function toGrams(weight: unknown, uom: unknown): number | undefined {
  const w = pickNum(weight)
  if (w === undefined) return undefined
  const u = (typeof uom === 'string' ? uom : '').toUpperCase()
  if (u === 'KG') return Math.round(w * 1000)
  if (u === 'LB' || u === 'LBS') return Math.round(w * 453.592)
  if (u === 'OZ') return Math.round(w * 28.3495)
  return Math.round(w) // assume grams
}

/** Convert a dimension in given UOM to centimetres. */
function toCm(value: unknown, uom: unknown): number | undefined {
  const v = pickNum(value)
  if (v === undefined) return undefined
  const u = (typeof uom === 'string' ? uom : '').toUpperCase()
  if (u === 'IN') return v * 2.54
  if (u === 'MM') return v / 10
  if (u === 'M') return v * 100
  if (u === 'FT') return v * 30.48
  return v // assume cm
}

export function transformProduct(raw: RawOracleWmsItem): Product {
  const id = String(raw.item_id)
  const dimUom = raw.dim_uom

  const length = toCm(raw.unit_length, dimUom)
  const width = toCm(raw.unit_width, dimUom)
  const height = toCm(raw.unit_height, dimUom)
  const hasDims = length !== undefined || width !== undefined || height !== undefined

  return {
    id,
    externalId: id,
    sku: pickStr(raw.item_number) ?? '',
    name: pickStr(raw.description) ?? pickStr(raw.item_number) ?? '',
    description: undefined,
    upc: undefined,
    brand: undefined,
    category: pickStr(raw.item_type),
    unitOfMeasure: pickStr(raw.std_uom) ?? 'each',
    weightGrams: toGrams(raw.unit_weight, raw.weight_uom),
    dimensionsCm: hasDims ? { length, width, height } : undefined,
    retailPrice: undefined,
    isActive: (pickStr(raw.status) ?? 'Active').toLowerCase() !== 'inactive',
    parentProductId: undefined,
    supplierIds: raw.default_vendor_id !== undefined ? [String(raw.default_vendor_id)] : [],
    createdAt: toIso(raw.created_date_time),
    updatedAt: toIso(raw.last_updated_date_time),
    platform: 'oracle-wms',
    metadata: strMap({
      itemType: raw.item_type,
      stdUom: raw.std_uom,
      weightUom: raw.weight_uom,
      dimUom: raw.dim_uom,
      companyId: raw.company_id,
      status: raw.status,
    }),
    raw,
  }
}
