/**
 * Cafe24 Shipment → canonical Fulfillment.
 *
 * Cafe24 models shipping via "shipments" nested under an order:
 *   GET /api/v2/admin/orders/{order_id}/shipments
 *
 * Key field conventions:
 *   - `shipping_code`   → unique shipment identifier
 *   - `order_id`        → parent order id
 *   - `status`          → shipment status string
 *   - `tracking_no`     → parcel tracking number
 *   - `carrier_id`      → carrier slug/id
 *   - `items`           → array of shipped order items
 *   - `created_date`    → ISO-8601 creation timestamp
 *   - `updated_date`    → ISO-8601 update timestamp
 *
 * Docs: https://developers.cafe24.com/docs/en/api/admin/#orders-shipments
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Cafe24 shapes ─────────────────────────────────────────────────────────

export interface RawCafe24ShipmentItem {
  order_item_code?: string | null
  quantity?: number | null
  [key: string]: unknown
}

export interface RawCafe24Shipment {
  shipping_code: string | number
  order_id: string
  status?: string | null
  tracking_no?: string | null
  carrier_id?: string | null
  carrier_name?: string | null
  items?: RawCafe24ShipmentItem[]
  created_date?: string | null
  updated_date?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map Cafe24 shipment status to canonical FulfillmentStatus.
 *
 * Cafe24 status strings (common values):
 *   standby, prepare, delivering, shipped, hold, etc.
 */
const STATUS_MAP: Record<string, FulfillmentStatus> = {
  standby: 'PENDING',
  prepare: 'OPEN',
  preparing: 'OPEN',
  delivering: 'SUCCESS',
  shipped: 'SUCCESS',
  delivery_complete: 'SUCCESS',
  hold: 'PENDING',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  error: 'ERROR',
}

function mapLineItems(
  items: RawCafe24ShipmentItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!items || items.length === 0) return undefined
  return items.map((i) => ({
    lineItemId: String(i.order_item_code ?? ''),
    quantity: typeof i.quantity === 'number' ? i.quantity : 0,
  }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawCafe24Shipment): Fulfillment {
  const statusKey = (raw.status ?? '').toLowerCase().replace(/ /g, '_')
  return {
    id: `${raw.order_id}:${raw.shipping_code}`,
    orderId: String(raw.order_id),
    status: STATUS_MAP[statusKey] ?? undefined,
    trackingNumber: raw.tracking_no ?? undefined,
    carrier: raw.carrier_name ?? raw.carrier_id ?? undefined,
    lineItems: mapLineItems(raw.items),
    createdAt: toIsoDatetime(raw.created_date),
    updatedAt: toIsoDatetime(raw.updated_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → Cafe24 shipment body (for create/update). */
export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (fulfillment.trackingNumber != null) body.tracking_no = fulfillment.trackingNumber
  if (fulfillment.carrier != null) body.carrier_id = fulfillment.carrier
  if (fulfillment.lineItems != null) {
    body.items = fulfillment.lineItems.map((li) => ({
      order_item_code: li.lineItemId,
      quantity: li.quantity,
    }))
  }
  return body
}
