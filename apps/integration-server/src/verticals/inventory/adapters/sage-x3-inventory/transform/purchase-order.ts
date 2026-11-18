/**
 * Transform Sage X3 PORDER representation to canonical PurchaseOrder.
 *
 * PORDER is the purchase order header in Sage X3.
 *
 * Key fields:
 *   POHNUM  — purchase order number (primary key)
 *   BPSNUM  — supplier code
 *   PRHFCY  — receipt site (destination warehouse)
 *   ORDDAT  — order date
 *   EXTDLVDAT — expected delivery date
 *   RCPDAT  — receipt (received) date
 *   CUR     — currency code
 *   TOTLIN  — order total excl. tax (decimal)
 *   AMTATI  — total amount incl. tax (decimal)
 *   POHSTA  — purchase order status
 *     1=Draft, 2=Open, 3=Partially received, 4=Received, 5=Closed, 6=Cancelled
 *
 * Lines (PORDERQ sub-table):
 *   ITMREF  — product reference
 *   QTYUOM  — ordered quantity
 *   RCPQTY  — received quantity
 *   NETPRI  — unit net price (decimal)
 *   LINAMT  — line total excl. tax (decimal)
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawSageX3PurchaseOrderLine {
  /** Product reference */
  ITMREF?: string
  /** Ordered quantity */
  QTYUOM?: number | string
  /** Received quantity */
  RCPQTY?: number | string
  /** Unit net price (decimal, e.g. 10.50) */
  NETPRI?: number | string
  /** Line total excl. tax (decimal) */
  LINAMT?: number | string
  [key: string]: unknown
}

export interface RawSageX3PurchaseOrder {
  /** Purchase order number */
  POHNUM?: string
  /** Supplier code */
  BPSNUM?: string
  /** Receipt site (destination warehouse) */
  PRHFCY?: string
  /** Order date */
  ORDDAT?: string
  /** Expected delivery date */
  EXTDLVDAT?: string
  /** Receipt / received date */
  RCPDAT?: string
  /** Currency code */
  CUR?: string
  /** Order status: '1'=Draft,'2'=Open,'3'=PartiallyReceived,'4'=Received,'5'=Closed,'6'=Cancelled */
  POHSTA?: string | number
  /** Order total excl. tax (decimal) */
  TOTLIN?: number | string
  /** Order total incl. tax (decimal) */
  AMTATI?: number | string
  /** Lines (PORDERQ) — may be inlined depending on facet */
  PORDERQ_ITMREF?: string[]
  PORDERQ_QTYUOM?: Array<number | string>
  PORDERQ_RCPQTY?: Array<number | string>
  PORDERQ_NETPRI?: Array<number | string>
  PORDERQ_LINAMT?: Array<number | string>
  /** Alternative: lines as array of objects */
  PORDERQ?: RawSageX3PurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(pohsta: string | number | undefined): PurchaseOrderStatus {
  switch (String(pohsta ?? '1').trim()) {
    case '1': return 'draft'
    case '2': return 'sent'
    case '3': return 'partially_received'
    case '4': return 'received'
    case '5': return 'closed'
    case '6': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawSageX3PurchaseOrder): PurchaseOrder {
  const id = pickStr(raw.POHNUM) ?? ''

  // Resolve lines — Sage X3 may return them as object array or parallel arrays
  let lines: PurchaseOrder['lines'] = []
  if (Array.isArray(raw.PORDERQ) && raw.PORDERQ.length > 0) {
    lines = raw.PORDERQ.map((l) => ({
      productId: pickStr(l.ITMREF) ?? '',
      quantityOrdered: pickNum(l.QTYUOM) ?? 0,
      quantityReceived: pickNum(l.RCPQTY),
      unitCost: pickNum(l.NETPRI),
      lineTotal: pickNum(l.LINAMT),
    }))
  } else if (Array.isArray(raw.PORDERQ_ITMREF)) {
    lines = raw.PORDERQ_ITMREF.map((itmref, i) => ({
      productId: pickStr(itmref) ?? '',
      quantityOrdered: pickNum(raw.PORDERQ_QTYUOM?.[i]) ?? 0,
      quantityReceived: pickNum(raw.PORDERQ_RCPQTY?.[i]),
      unitCost: pickNum(raw.PORDERQ_NETPRI?.[i]),
      lineTotal: pickNum(raw.PORDERQ_LINAMT?.[i]),
    }))
  }

  return {
    id,
    externalId: id,
    number: id,
    supplierId: pickStr(raw.BPSNUM) ?? '',
    destinationLocationId: pickStr(raw.PRHFCY),
    status: mapStatus(raw.POHSTA),
    currency: pickStr(raw.CUR),
    subtotalAmount: pickNum(raw.TOTLIN),
    totalAmount: pickNum(raw.AMTATI),
    lines,
    orderedAt: toIso(raw.ORDDAT),
    expectedAt: toIso(raw.EXTDLVDAT),
    receivedAt: toIso(raw.RCPDAT),
    platform: 'sage-x3-inventory',
    metadata: strMap({ pohsta: raw.POHSTA, prhfcy: raw.PRHFCY }),
    raw,
  }
}
