/**
 * Yo!Kart Order Shipment → canonical Fulfillment.
 *
 * Yo!Kart exposes delivery / shipment details on an order's sub-resource.
 * Shipment records are retrieved via:
 *   GET /admin/orders/shipments/{orderId}  → list shipments for an order
 *   GET /admin/shipments/view/{id}         → single shipment detail
 *
 * The status lifecycle maps onto the canonical FulfillmentStatus.
 *
 * Docs: https://www.yo-kart.com/resource-center.html (API Document V2.3)
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw Yo!Kart shapes ────────────────────────────────────────────────────────

export interface RawYokartShipmentProduct {
  op_id: number | string
  quantity?: number | string
  [key: string]: unknown
}

export interface RawYokartShipment {
  shipment_id: number | string
  order_id?: number | string
  shipment_status?: string | number  // 1=shipped, 2=delivered, 3=cancelled, etc.
  tracking_number?: string | null
  carrier_name?: string | null
  shipping_service?: string | null
  shipment_date?: string | null
  estimated_delivery_date?: string | null
  actual_delivery_date?: string | null
  products?: RawYokartShipmentProduct[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  '0': 'PENDING',
  pending: 'PENDING',
  '1': 'OPEN',
  shipped: 'OPEN',
  '2': 'SUCCESS',
  delivered: 'SUCCESS',
  '3': 'CANCELLED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  failed: 'FAILURE',
}

function mapStatus(raw: string | number | undefined): FulfillmentStatus | undefined {
  if (raw == null) return undefined
  return STATUS_MAP[String(raw).toLowerCase()] ?? undefined
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawYokartShipment, orderId?: string): Fulfillment {
  const resolvedOrderId = orderId ?? String(raw.order_id ?? '')

  const lineItems = (raw.products ?? []).map((p) => ({
    lineItemId: String(p.op_id),
    quantity: p.quantity != null ? parseInt(String(p.quantity), 10) || 1 : 1,
  }))

  return {
    id: String(raw.shipment_id),
    orderId: resolvedOrderId,
    status: mapStatus(raw.shipment_status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrier: raw.carrier_name ?? undefined,
    service: raw.shipping_service ?? undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippedAt: toIsoDatetime(raw.shipment_date),
    estimatedDeliveryAt: toIsoDatetime(raw.estimated_delivery_date),
    deliveredAt: toIsoDatetime(raw.actual_delivery_date),
    createdAt: toIsoDatetime(raw.shipment_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
