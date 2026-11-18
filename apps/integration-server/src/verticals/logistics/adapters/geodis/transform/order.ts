/**
 * Geodis order transform.
 *
 * Source endpoints (GEODIS Americas WMS API, apigw.ams.geodis.com):
 *   POST /api/order/v1                  — create an outbound order
 *   GET  /api/ShipmentConfirmation/v1   — list fulfilled/shipped orders
 *
 * Geodis order fields are taken from the documented Postman collection
 * (https://docs.api.geodis.com/api/collections/23261785/2s8YzUyhAw).
 */
import type { Order, OrderStatus } from '../../../schema/order'
import type { Address, Lineitem } from '../../../schema/shared'
import { toISODate, parseDecimal } from '../../shared/transform'

// ─── Geodis raw types ─────────────────────────────────────────────────────────

export interface GeodisOrderLineItem {
  line_number?: string | number | null
  sku?: string | null
  description?: string | null
  quantity?: number | null
  unit_price?: number | string | null
  [key: string]: unknown
}

export interface GeodisOrderAddress {
  name?: string | null
  company?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

/** Shape returned by POST /api/order/v1 and GET /api/ShipmentConfirmation/v1 */
export interface GeodisOrder {
  order_id?: string | null
  order_number?: string | null
  customer_id?: string | null
  warehouse_id?: string | null
  status?: string | null
  ship_to?: GeodisOrderAddress | null
  ship_from?: GeodisOrderAddress | null
  line_items?: GeodisOrderLineItem[] | null
  currency?: string | null
  subtotal?: number | string | null
  tax_amount?: number | string | null
  shipping_amount?: number | string | null
  discount_amount?: number | string | null
  total_amount?: number | string | null
  notes?: string | null
  service_code?: string | null
  order_date?: string | null
  shipped_date?: string | null
  delivered_date?: string | null
  cancelled_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  shipment_ids?: string[] | null
  [key: string]: unknown
}

// ─── Status mapping ───────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'UNKNOWN'
  const v = status.toUpperCase()
  if (v === 'PENDING' || v === 'NEW') return 'PENDING'
  if (v === 'PROCESSING' || v === 'IN_PROCESS' || v === 'PICKING') return 'PROCESSING'
  if (v === 'ON_HOLD' || v === 'HOLD') return 'ON_HOLD'
  if (v === 'AWAITING_SHIPMENT' || v === 'READY_TO_SHIP') return 'AWAITING_SHIPMENT'
  if (v === 'SHIPPED' || v === 'CONFIRMED' || v === 'FULFILLED') return 'SHIPPED'
  if (v === 'DELIVERED') return 'DELIVERED'
  if (v === 'CANCELLED' || v === 'CANCELED') return 'CANCELLED'
  if (v === 'RETURNED' || v.includes('RETURN')) return 'RETURNED'
  return 'UNKNOWN'
}

// ─── Address helper ───────────────────────────────────────────────────────────

function toAddr(raw: GeodisOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.name ?? undefined,
    company: raw.company ?? undefined,
    street1: raw.address1 ?? undefined,
    street2: raw.address2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.zip ?? undefined,
    country: (raw.country ?? undefined) as string | undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

// ─── Line-item helper ─────────────────────────────────────────────────────────

function toLineitem(raw: GeodisOrderLineItem): Lineitem {
  const unitAmt = parseDecimal(raw.unit_price)
  const qty = raw.quantity ?? undefined
  return {
    id: raw.line_number != null ? String(raw.line_number) : undefined,
    sku: raw.sku ?? undefined,
    name: raw.description ?? undefined,
    quantity: qty ?? null,
    unitAmount: unitAmt ?? null,
    totalAmount:
      unitAmt != null && qty != null ? Math.round(unitAmt * qty) : null,
  }
}

// ─── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: GeodisOrder): Order {
  return {
    id: raw.order_id ?? raw.order_number ?? undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.order_number ?? undefined,
    customerId: raw.customer_id ?? undefined,
    warehouseId: raw.warehouse_id ?? undefined,
    shipmentIds: raw.shipment_ids ?? undefined,
    originAddress: toAddr(raw.ship_from),
    destinationAddress: toAddr(raw.ship_to),
    lineItems: raw.line_items ? raw.line_items.map(toLineitem) : undefined,
    currency: (raw.currency ?? undefined) as string | undefined,
    subtotalAmount: parseDecimal(raw.subtotal),
    taxAmount: parseDecimal(raw.tax_amount),
    shippingAmount: parseDecimal(raw.shipping_amount),
    discountAmount: parseDecimal(raw.discount_amount),
    totalAmount: parseDecimal(raw.total_amount),
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.service_code ?? undefined,
    orderAt: toISODate(raw.order_date),
    shippedAt: toISODate(raw.shipped_date),
    deliveredAt: toISODate(raw.delivered_date),
    cancelledAt: toISODate(raw.cancelled_date),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
