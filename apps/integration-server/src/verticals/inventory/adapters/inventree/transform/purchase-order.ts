import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'
import { PO_STATUS_CODES } from '../constants'

/**
 * Raw PurchaseOrder record from InvenTree GET /api/order/po/ or GET /api/order/po/{id}/
 * Source: InvenTree API schema v265, PurchaseOrder schema.
 */
export interface RawInvenTreePurchaseOrder {
  pk: number
  reference?: string             // e.g. "PO-0001"
  supplier?: number              // Company ID
  supplier_name?: string
  supplier_reference?: string
  description?: string
  status?: number                // numeric status code (see PO_STATUS_CODES)
  status_text?: string
  creation_date?: string | null
  issue_date?: string | null
  target_date?: string | null
  complete_date?: string | null
  total_price?: string | null    // decimal string
  order_currency?: string | null
  line_items?: number            // count of line items
  completed_lines?: number
  overdue?: boolean
  [key: string]: unknown
}

/**
 * Raw PurchaseOrderLineItem from InvenTree GET /api/order/po-line/?order={id}
 * Source: InvenTree API schema v265, PurchaseOrderLineItem schema.
 */
export interface RawInvenTreePOLine {
  pk: number
  part?: number | null           // SupplierPart ID
  internal_part?: number | null  // Part ID
  internal_part_name?: string
  sku?: string
  quantity?: number
  received?: number
  purchase_price?: string | null // decimal string
  total_price?: string | null    // decimal string
  destination?: number | null    // StockLocation ID
  order?: number
  [key: string]: unknown
}

function mapStatus(code: number | undefined): PurchaseOrderStatus {
  const label = PO_STATUS_CODES[code ?? -1]
  switch (label) {
    case 'pending': return 'draft'
    case 'placed': return 'sent'
    case 'on_hold': return 'draft'
    case 'complete': return 'received'
    case 'cancelled': return 'cancelled'
    case 'lost': return 'cancelled'
    case 'returned': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(
  raw: RawInvenTreePurchaseOrder,
  lines: RawInvenTreePOLine[] = [],
): PurchaseOrder {
  const id = String(raw.pk)

  // total_price is a decimal string; store raw but do not convert to minor units
  // (currency unknown until order_currency is set; keep as-is)
  const totalNum = pickNum(raw.total_price ?? undefined)

  return {
    id,
    externalId: id,
    number: pickStr(raw.reference),
    supplierId: raw.supplier != null ? String(raw.supplier) : '',
    destinationLocationId: undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.order_currency),
    subtotalAmount: totalNum,
    totalAmount: totalNum,
    lines: lines.map((l) => ({
      productId: l.internal_part != null ? String(l.internal_part) : String(l.part ?? ''),
      quantityOrdered: pickNum(l.quantity) ?? 0,
      quantityReceived: pickNum(l.received),
      unitCost: pickNum(l.purchase_price ?? undefined),
      lineTotal: pickNum(l.total_price ?? undefined),
    })),
    expectedAt: toIso(raw.target_date),
    orderedAt: toIso(raw.issue_date),
    receivedAt: toIso(raw.complete_date),
    platform: 'inventree',
    metadata: strMap({
      description: raw.description,
      supplierName: raw.supplier_name,
      supplierReference: raw.supplier_reference,
      statusText: raw.status_text,
      lineItems: raw.line_items,
      completedLines: raw.completed_lines,
      overdue: raw.overdue,
    }),
    raw,
  }
}
