/**
 * MyCashflow Shipment → canonical Fulfillment.
 *
 * MyCashflow models shipments as sub-resources on orders:
 *   GET /v1/orders/{id}/shipments
 *
 * A shipment carries tracking info, a delivery status, and the list of order
 * rows (line items) included in the shipment.
 *
 * Status mapping (MyCashflow → canonical FulfillmentStatus):
 *   "pending"   → PENDING
 *   "sent"      → SUCCESS  (shipment has been sent / dispatched)
 *   "delivered" → SUCCESS
 *   "cancelled" → CANCELLED
 *   otherwise   → OPEN
 *
 * Docs: https://support.mycashflow.com/api/11-orders/
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawMyCashflowShipmentRow {
  id?: number | string
  order_row_id?: number | string | null
  quantity?: number
  [key: string]: unknown
}

export interface RawMyCashflowShipment {
  id: number | string
  order_id?: number | string | null
  status?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  carrier?: string | null
  /** Some API versions use `shipping_method` instead. */
  shipping_method?: string | null
  rows?: RawMyCashflowShipmentRow[]
  created_at?: string
  updated_at?: string
  sent_at?: string | null
  delivered_at?: string | null
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  pending: 'PENDING',
  sent: 'SUCCESS',
  delivered: 'SUCCESS',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
}

function mapLineItems(
  rows: RawMyCashflowShipmentRow[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!rows || rows.length === 0) return undefined
  return rows.map((r) => ({
    lineItemId: r.order_row_id != null ? String(r.order_row_id) : String(r.id ?? ''),
    quantity: r.quantity ?? 1,
  }))
}

export function transformFulfillment(
  raw: RawMyCashflowShipment,
  orderId: string,
): Fulfillment {
  const statusKey = (raw.status ?? '').toLowerCase()
  const status: FulfillmentStatus =
    STATUS_MAP[statusKey] ?? (statusKey ? 'OPEN' : 'PENDING')

  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : orderId,
    status,
    trackingNumber: raw.tracking_number ?? undefined,
    trackingUrl: raw.tracking_url ?? undefined,
    carrier: raw.carrier ?? raw.shipping_method ?? undefined,
    lineItems: mapLineItems(raw.rows),
    shippedAt: raw.sent_at ?? undefined,
    deliveredAt: raw.delivered_at ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
