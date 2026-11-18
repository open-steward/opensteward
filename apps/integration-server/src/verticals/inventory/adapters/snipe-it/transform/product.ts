/**
 * Snipe-IT hardware asset → Product transform.
 *
 * Snipe-IT is an IT asset tracker; "assets" (hardware) map onto the Product
 * schema.  purchase_cost is stored as a decimal string by Snipe-IT; we convert
 * to integer minor units (cents) to satisfy the Amount schema.
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

/** Snipe-IT date wrapper: { datetime: string, formatted: string } */
interface SnipeDate {
  datetime?: string
  formatted?: string
}

/** Snipe-IT name-id sub-object */
interface SnipeRef {
  id?: number
  name?: string
  [key: string]: unknown
}

export interface RawSnipeItAsset {
  id: number
  name?: string
  asset_tag?: string
  serial?: string
  model?: SnipeRef | null
  model_number?: string
  status_label?: SnipeRef & { status_type?: string; status_meta?: string }
  category?: SnipeRef | null
  manufacturer?: SnipeRef | null
  supplier?: SnipeRef | null
  location?: SnipeRef | null
  rtd_location?: SnipeRef | null
  company?: SnipeRef | null
  notes?: string
  order_number?: string
  purchase_date?: SnipeDate | string | null
  purchase_cost?: string | number | null
  warranty_months?: number | null
  created_at?: SnipeDate | string | null
  updated_at?: SnipeDate | string | null
  last_audit_date?: string | null
  next_audit_date?: string | null
  asset_eol_date?: string | null
  requestable?: boolean
  [key: string]: unknown
}

function extractDate(v: SnipeDate | string | null | undefined): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return toIso(v)
  return toIso(v.datetime ?? v.formatted)
}

/**
 * Convert a purchase_cost decimal string/number to integer minor units (cents).
 * Returns undefined if the value is absent or not parseable.
 */
function toMinorUnits(v: string | number | null | undefined): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : parseFloat(v)
  if (Number.isNaN(n)) return undefined
  return Math.round(n * 100)
}

export function transformProduct(raw: RawSnipeItAsset): Product {
  const id = String(raw.id)
  const supplierId = raw.supplier?.id != null ? String(raw.supplier.id) : undefined

  const costMinorUnits = toMinorUnits(raw.purchase_cost)

  return {
    id,
    externalId: id,
    sku: pickStr(raw.asset_tag) ?? '',
    name: pickStr(raw.name) ?? pickStr(raw.asset_tag) ?? id,
    description: pickStr(raw.notes),
    brand: pickStr(raw.manufacturer?.name),
    category: pickStr(raw.category?.name),
    unitOfMeasure: 'each',
    cost:
      costMinorUnits !== undefined
        ? { amount: costMinorUnits, currency: 'USD' }
        : undefined,
    isActive: raw.status_label?.status_meta !== 'Archived',
    supplierIds: supplierId ? [supplierId] : [],
    createdAt: extractDate(raw.created_at),
    updatedAt: extractDate(raw.updated_at),
    platform: 'snipe-it',
    metadata: strMap({
      serial: raw.serial,
      modelName: raw.model?.name,
      modelNumber: raw.model_number,
      statusType: raw.status_label?.status_type,
      statusMeta: raw.status_label?.status_meta,
      locationName: raw.location?.name,
      rtdLocationName: raw.rtd_location?.name,
      orderNumber: raw.order_number,
      warrantyMonths: raw.warranty_months,
      assetEolDate: raw.asset_eol_date,
      lastAuditDate: raw.last_audit_date,
      nextAuditDate: raw.next_audit_date,
    }),
    raw,
  }
}
