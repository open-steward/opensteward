/**
 * Transform an Inventory Planner variant (Reports API /api/v1/variants) into
 * the canonical Product schema.
 *
 * Inventory Planner treats each product variant as a first-class object with
 * its own SKU, cost, retail price, replenishment data, and per-warehouse stock.
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

export interface RawInventoryPlannerVariant {
  /** Variant unique identifier (MongoDB ObjectId-like hex string) */
  _id: string
  sku?: string
  title?: string
  /** Product-level title when variant is a child */
  product_title?: string
  barcode?: string
  vendor?: string
  vendor_id?: string
  /** Costing / pricing */
  cost?: number
  price?: number
  currency?: string
  /** Inventory data — aggregate across warehouses */
  in_stock?: number
  replenishment?: number
  on_order?: number
  /** Warehouse-scoped inventory records keyed by warehouse name */
  warehouses?: Record<string, {
    in_stock?: number
    replenishment?: number
    on_order?: number
    reorder_point?: number
  }>
  /** Lead and review timing (days) */
  lead_time?: number
  review_period?: number
  /** Whether still active/sold */
  archived?: boolean
  /** Timestamps */
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawInventoryPlannerVariant): Product {
  const id = raw._id
  const supplierIds: string[] = []
  if (raw.vendor_id) supplierIds.push(raw.vendor_id)

  const name = pickStr(raw.product_title ?? raw.title) ?? ''
  const description = raw.product_title && raw.title && raw.title !== raw.product_title
    ? pickStr(raw.title)
    : undefined

  return {
    id,
    externalId: id,
    sku: pickStr(raw.sku) ?? '',
    name,
    description,
    upc: pickStr(raw.barcode),
    brand: pickStr(raw.vendor),
    category: undefined,
    unitOfMeasure: 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    retailPrice: raw.price !== undefined
      ? { amount: raw.price, currency: pickStr(raw.currency) ?? 'USD' }
      : undefined,
    cost: raw.cost !== undefined
      ? { amount: raw.cost, currency: pickStr(raw.currency) ?? 'USD' }
      : undefined,
    isActive: !(raw.archived === true),
    parentProductId: undefined,
    supplierIds,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'inventory-planner',
    metadata: strMap({
      leadTime: raw.lead_time,
      reviewPeriod: raw.review_period,
      replenishment: raw.replenishment,
    }),
    raw,
  }
}
