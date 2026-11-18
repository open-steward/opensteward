import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

/**
 * Raw item shape from GET /stock/inventory and GET /stock/inventory/{article_id}.
 * The endpoint returns on-hand quantities and costs per stock item.
 */
export interface RawMrpeasyStockLevel {
  article_id: number | string
  code?: string
  title?: string
  in_stock?: number | string
  available?: number | string
  booked?: number | string
  expected_total?: number | string
  min_quantity?: number | string
  site_id?: number | string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawMrpeasyStockLevel): StockLevel {
  const productId = String(raw.article_id)
  const siteId = raw.site_id !== undefined ? String(raw.site_id) : ''
  const locationId = siteId

  const onHand = raw.in_stock !== undefined ? Number(raw.in_stock) : 0
  const available = raw.available !== undefined ? Number(raw.available) : undefined
  const committed = raw.booked !== undefined ? Number(raw.booked) : undefined
  const incoming = raw.expected_total !== undefined ? Number(raw.expected_total) : undefined
  const reorderPoint = raw.min_quantity !== undefined ? Number(raw.min_quantity) : undefined

  return {
    id: siteId ? `${productId}:${siteId}` : productId,
    productId,
    locationId,
    quantityOnHand: Number.isNaN(onHand) ? 0 : onHand,
    quantityAvailable: available !== undefined && !Number.isNaN(available) ? available : undefined,
    quantityCommitted: committed !== undefined && !Number.isNaN(committed) ? committed : undefined,
    quantityIncoming: incoming !== undefined && !Number.isNaN(incoming) ? incoming : undefined,
    reorderPoint: reorderPoint !== undefined && !Number.isNaN(reorderPoint) ? reorderPoint : undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'mrpeasy',
    metadata: strMap({ code: raw.code, title: raw.title }),
    raw,
  }
}
