/**
 * SPS Commerce purchase order transform.
 *
 * Wire field names follow SPS Commerce REST API standards (snake_case).
 * The Fulfillment API exposes 850-equivalent purchase orders as JSON.
 * Reference: GET /fulfillment/v1/purchaseorders, GET /fulfillment/v1/purchaseorders/{poId}
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawSpsCommercePurchaseOrder {
  /** SPS internal PO identifier */
  po_id?: string
  /** Buyer-issued PO number (EDI 850 BEG03) */
  purchase_order_number: string
  /** Vendor / supplier identifier */
  vendor_id?: string
  /** Trading partner ID for the supplier */
  trading_partner_id?: string
  /** PO lifecycle status */
  status?: string
  /** Currency code (ISO 4217) */
  currency_code?: string
  /** Subtotal before tax/freight */
  subtotal_amount?: number
  /** Total order amount */
  total_amount?: number
  /** Destination location / warehouse identifier */
  ship_to_location_id?: string
  /** Ship-to name */
  ship_to_name?: string
  /** PO order date */
  order_date?: string
  /** Requested delivery / ship date */
  requested_ship_date?: string
  /** Actual received / completed date */
  received_date?: string
  /** Cancel-after date */
  cancel_after_date?: string
  /** PO line items */
  items?: Array<{
    item_id?: string
    buyer_item_number?: string
    vendor_item_number?: string
    upc?: string
    quantity_ordered?: number
    quantity_received?: number
    unit_price?: number
    line_total?: number
    unit_of_measure?: string
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'NEW':
    case 'DRAFT': return 'draft'
    case 'SENT':
    case 'SUBMITTED':
    case 'ACKNOWLEDGED': return 'sent'
    case 'PARTIALLY_RECEIVED':
    case 'PARTIAL': return 'partially_received'
    case 'RECEIVED': return 'received'
    case 'COMPLETED':
    case 'CLOSED': return 'closed'
    case 'CANCELLED':
    case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawSpsCommercePurchaseOrder): PurchaseOrder {
  const id = raw.po_id ?? raw.purchase_order_number
  return {
    id,
    externalId: id,
    number: pickStr(raw.purchase_order_number),
    supplierId: raw.vendor_id ?? raw.trading_partner_id ?? '',
    destinationLocationId: pickStr(raw.ship_to_location_id),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency_code),
    subtotalAmount: pickNum(raw.subtotal_amount),
    totalAmount: pickNum(raw.total_amount),
    lines: (raw.items ?? []).map((l) => ({
      productId: l.item_id ?? l.buyer_item_number ?? l.vendor_item_number ?? l.upc ?? '',
      quantityOrdered: pickNum(l.quantity_ordered) ?? 0,
      quantityReceived: pickNum(l.quantity_received),
      unitCost: pickNum(l.unit_price),
      lineTotal: pickNum(l.line_total),
    })),
    orderedAt: toIso(raw.order_date),
    expectedAt: toIso(raw.requested_ship_date),
    receivedAt: toIso(raw.received_date),
    platform: 'sps-commerce',
    metadata: strMap({
      shipToName: raw.ship_to_name,
      cancelAfterDate: raw.cancel_after_date,
      tradingPartnerId: raw.trading_partner_id,
    }),
    raw,
  }
}
