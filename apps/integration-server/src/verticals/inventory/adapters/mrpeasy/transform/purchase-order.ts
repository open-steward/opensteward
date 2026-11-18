import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Raw purchase order shape from GET /purchase-orders and GET /purchase-orders/{id}.
 * Field names sourced from MRPeasy REST API v1 documentation.
 * Status codes: 5=Draft, 10=Ordered, 20=Partially Received, 30=Received,
 *               40=Completed, 110=Cancelled, 120=Voided.
 */
export interface RawMrpeasyPurchaseOrder {
  pur_ord_id: number | string
  code?: string
  vendor_id?: number | string
  vendor_code?: string
  vendor_title?: string
  status?: number | string
  currency?: string
  total_price?: number | string
  order_number?: string
  order_date?: number | string
  expected_date?: number | string
  due_date?: number | string
  arrival_date?: number | string
  invoice_number?: string
  invoice_date?: number | string
  items?: Array<{
    article_id: number | string
    quantity: number | string
    received?: number | string
    unit_price?: number | string
    total_price?: number | string
  }>
  [key: string]: unknown
}

function mapStatus(s: number | string | undefined): PurchaseOrderStatus {
  const code = Number(s ?? 0)
  switch (code) {
    case 5: return 'draft'
    case 10: return 'sent'
    case 20: return 'partially_received'
    case 30: return 'received'
    case 40: return 'closed'
    case 110: return 'cancelled'
    case 120: return 'cancelled'
    default: return 'draft'
  }
}

/**
 * MRPeasy stores dates as Unix timestamps (integers).
 * Convert to ISO 8601 string.
 */
function unixToIso(v: number | string | undefined): string | undefined {
  if (v == null) return undefined
  const n = Number(v)
  if (Number.isNaN(n) || n === 0) return undefined
  // MRPeasy timestamps are in seconds
  return new Date(n * 1000).toISOString()
}

export function transformPurchaseOrder(raw: RawMrpeasyPurchaseOrder): PurchaseOrder {
  const id = String(raw.pur_ord_id)
  const vendorId = raw.vendor_id !== undefined ? String(raw.vendor_id) : (raw.vendor_code ?? raw.vendor_title ?? '')

  return {
    id,
    externalId: id,
    number: pickStr(raw.code) ?? pickStr(raw.order_number),
    supplierId: vendorId,
    destinationLocationId: undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: undefined,
    totalAmount: pickNum(raw.total_price),
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.article_id),
      quantityOrdered: Number(l.quantity),
      quantityReceived: l.received !== undefined ? Number(l.received) : undefined,
      unitCost: l.unit_price !== undefined ? pickNum(l.unit_price) : undefined,
      lineTotal: l.total_price !== undefined ? pickNum(l.total_price) : undefined,
    })),
    expectedAt: unixToIso(raw.expected_date) ?? toIso(raw.expected_date as string | undefined),
    orderedAt: unixToIso(raw.order_date) ?? toIso(raw.order_date as string | undefined),
    receivedAt: unixToIso(raw.arrival_date) ?? toIso(raw.arrival_date as string | undefined),
    platform: 'mrpeasy',
    metadata: strMap({
      vendorCode: raw.vendor_code,
      vendorTitle: raw.vendor_title,
      invoiceNumber: raw.invoice_number,
      orderNumber: raw.order_number,
    }),
    raw,
  }
}
