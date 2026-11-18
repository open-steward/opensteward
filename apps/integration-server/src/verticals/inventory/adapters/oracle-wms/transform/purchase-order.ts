/**
 * Oracle WMS Cloud — purchase_order_hdr entity → PurchaseOrder
 *
 * lgfapi endpoint: GET /wms/lgfapi/v10/entity/purchase_order_hdr/
 *
 * Oracle WMS Cloud receives inbound shipments via either:
 *   a) Purchase Orders (purchase_order_hdr + purchase_order_dtl lines)
 *   b) ASNs — Advance Shipping Notices (asn_hdr + asn_dtl lines)
 *
 * This transform covers the purchase_order_hdr entity.
 *
 * Key fields:
 *   po_hdr_id            — internal integer PK
 *   po_num               — purchase order number (displayed in WMS UI)
 *   vendor_id            — FK to vendor (supplier)
 *   facility_id          — destination facility/warehouse FK
 *   status               — "Open", "Closed", "Cancelled", "In Progress", "Partially Received"
 *   currency             — currency code (e.g. "USD")
 *   open_line_qty        — total open / outstanding line quantity (not always present)
 *   expected_date        — expected delivery date
 *   creation_date        — PO creation date
 *   last_updated_date    — last modification date
 *   purchase_order_dtl_set — array of line items (FK set)
 *
 * Line item fields (purchase_order_dtl):
 *   po_dtl_id        — line PK
 *   item_id          — FK to item
 *   qty_ordered      — quantity ordered
 *   qty_received     — quantity received to date
 *   unit_price       — unit cost (stored as decimal string in WMS)
 *   line_price       — total line cost
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawOracleWmsPoLine {
  po_dtl_id?: number | string
  item_id?: number | string
  qty_ordered?: number | string
  qty_received?: number | string
  unit_price?: number | string
  line_price?: number | string
  [key: string]: unknown
}

export interface RawOracleWmsPurchaseOrderHdr {
  po_hdr_id: number | string
  po_num?: string
  vendor_id?: number | string
  facility_id?: number | string
  status?: string
  currency?: string
  expected_date?: string
  creation_date?: string
  last_updated_date?: string
  purchase_order_dtl_set?: RawOracleWmsPoLine[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  const u = (s ?? '').toUpperCase()
  if (u === 'OPEN' || u === 'NEW') return 'sent'
  if (u === 'IN PROGRESS' || u === 'IN_PROGRESS' || u === 'RECEIVING') return 'partially_received'
  if (u === 'PARTIALLY RECEIVED' || u === 'PARTIALLY_RECEIVED') return 'partially_received'
  if (u === 'RECEIVED' || u === 'CLOSED' || u === 'COMPLETE' || u === 'COMPLETED') return 'closed'
  if (u === 'CANCELLED' || u === 'CANCELED' || u === 'VOIDED') return 'cancelled'
  return 'draft'
}

/** Convert a price value (potentially decimal string) to integer minor units (cents). */
function toMinorUnits(v: unknown): number | undefined {
  const n = pickNum(v)
  if (n === undefined) return undefined
  return Math.round(n * 100)
}

export function transformPurchaseOrder(raw: RawOracleWmsPurchaseOrderHdr): PurchaseOrder {
  const id = String(raw.po_hdr_id)
  const lines = (raw.purchase_order_dtl_set ?? []).map((l) => ({
    productId: l.item_id !== undefined ? String(l.item_id) : '',
    quantityOrdered: pickNum(l.qty_ordered) ?? 0,
    quantityReceived: pickNum(l.qty_received),
    unitCost: toMinorUnits(l.unit_price),
    lineTotal: toMinorUnits(l.line_price),
  }))

  return {
    id,
    externalId: id,
    number: pickStr(raw.po_num),
    supplierId: raw.vendor_id !== undefined ? String(raw.vendor_id) : '',
    destinationLocationId: raw.facility_id !== undefined ? String(raw.facility_id) : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: undefined,
    totalAmount: undefined,
    lines,
    expectedAt: toIso(raw.expected_date),
    orderedAt: toIso(raw.creation_date),
    receivedAt: undefined,
    platform: 'oracle-wms',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
