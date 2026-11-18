/**
 * Transform a raw Jushuitan purchase order record (/open/purchase/query) into a
 * canonical PurchaseOrder.
 *
 * Jushuitan field reference:
 *   po_id          — numeric purchase order ID
 *   po_code        — human-readable PO number/code
 *   supplier_id    — supplier numeric ID
 *   wms_co_id      — destination warehouse ID
 *   status         — PO status code (see mapStatus below)
 *   currency       — settlement currency code
 *   total_amount   — order total in fen (integer minor units, CNY)
 *   items          — line items array
 *     sku_id       — SKU numeric ID
 *     i_id         — SKU code string
 *     qty          — quantity ordered
 *     qty_in       — quantity received/inbounded
 *     price        — unit cost in fen (integer minor units)
 *     total        — line total in fen (integer minor units)
 *   created        — order creation datetime
 *   expect_in_date — expected delivery datetime
 *   in_date        — actual receive datetime
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawJushuitanPurchaseOrderItem {
  sku_id: number | string
  i_id?: string
  qty?: number
  qty_in?: number
  price?: number
  total?: number
  [key: string]: unknown
}

export interface RawJushuitanPurchaseOrder {
  po_id: number | string
  po_code?: string
  supplier_id?: number | string
  wms_co_id?: number | string
  status?: string | number
  currency?: string
  total_amount?: number
  items?: RawJushuitanPurchaseOrderItem[]
  created?: string
  expect_in_date?: string
  in_date?: string
  [key: string]: unknown
}

function mapStatus(s: string | number | undefined): PurchaseOrderStatus {
  // Jushuitan purchase order statuses (numeric codes):
  //   0 = draft, 1 = submitted/sent, 2 = partially received, 3 = received, 4 = closed, -1 = cancelled
  const code = typeof s === 'number' ? s : parseInt(String(s ?? ''), 10)
  switch (code) {
    case 0: return 'draft'
    case 1: return 'sent'
    case 2: return 'partially_received'
    case 3: return 'received'
    case 4: return 'closed'
    case -1: return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawJushuitanPurchaseOrder): PurchaseOrder {
  const id = String(raw.po_id)

  return {
    id,
    externalId: id,
    number: pickStr(raw.po_code),
    supplierId: raw.supplier_id != null ? String(raw.supplier_id) : '',
    destinationLocationId: raw.wms_co_id != null ? String(raw.wms_co_id) : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency) ?? 'CNY',
    // total_amount already in fen (integer minor units)
    totalAmount: raw.total_amount != null ? Math.round(raw.total_amount) : undefined,
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.sku_id),
      quantityOrdered: l.qty ?? 0,
      quantityReceived: l.qty_in,
      // unit cost in fen (integer minor units)
      unitCost: l.price != null ? Math.round(l.price) : undefined,
      // line total in fen (integer minor units)
      lineTotal: l.total != null ? Math.round(l.total) : undefined,
    })),
    orderedAt: toIso(raw.created),
    expectedAt: toIso(raw.expect_in_date),
    receivedAt: toIso(raw.in_date),
    platform: 'jushuitan',
    metadata: strMap({}),
    raw,
  }
}
