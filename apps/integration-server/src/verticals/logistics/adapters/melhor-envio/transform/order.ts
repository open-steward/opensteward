import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate, parseDecimal } from '../../shared/transform'

// ─── Melhor Envio raw types ───────────────────────────────────────────────────

/**
 * Shape returned by GET /api/v2/me/orders and GET /api/v2/me/orders/:id.
 * In the Melhor Envio model an "order" is a cart item that has been paid
 * and represents a shipping label with full sender/recipient detail.
 */
export interface MelhorEnvioOrder {
  id?: string | number | null
  protocol?: string | null
  status?: string | null
  tracking?: string | null
  service_id?: number | null
  service_code?: string | null
  service?: {
    id?: number | null
    name?: string | null
    [key: string]: unknown
  } | null
  company?: {
    id?: number | null
    name?: string | null
    [key: string]: unknown
  } | null
  from?: Record<string, unknown> | null
  to?: Record<string, unknown> | null
  price?: number | string | null
  discount?: number | string | null
  insurance_value?: number | string | null
  products?: Array<{
    id?: string | number | null
    name?: string | null
    quantity?: number | null
    unitary_value?: number | string | null
    weight?: number | string | null
    [key: string]: unknown
  }> | null
  volumes?: Array<Record<string, unknown>> | null
  tags?: Array<{ tag?: string | null; url?: string | null }> | null
  paid_at?: string | null
  generated_at?: string | null
  posted_at?: string | null
  delivered_at?: string | null
  canceled_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'UNKNOWN'
  const v = status.toUpperCase()
  if (v === 'PENDING' || v === 'PENDING_PAYMENT') return 'PENDING'
  if (v === 'RELEASED' || v === 'PAID' || v === 'GENERATED') return 'AWAITING_SHIPMENT'
  if (v === 'POSTED' || v.includes('TRANSIT')) return 'SHIPPED'
  if (v === 'DELIVERED') return 'DELIVERED'
  if (v === 'CANCELED' || v === 'CANCELLED' || v === 'CANCELADO') return 'CANCELLED'
  if (v === 'NOT_DELIVERED' || v.includes('RETURN') || v.includes('DEVOL')) return 'RETURNED'
  return 'UNKNOWN'
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: MelhorEnvioOrder): Order {
  const id = raw.id != null ? String(raw.id) : undefined
  const orderNumber = raw.protocol ?? undefined

  // Best-effort price in minor units (Melhor Envio returns BRL as decimal).
  const priceDecimal = parseDecimal(raw.price)
  const discountDecimal = parseDecimal(raw.discount)
  const totalAmount =
    priceDecimal != null ? Math.round(priceDecimal * 100) : undefined
  const discountAmount =
    discountDecimal != null ? Math.round(discountDecimal * 100) : undefined

  // Line items from the products array.
  const lineItems =
    raw.products && raw.products.length > 0
      ? raw.products.map((p) => ({
          id: p.id != null ? String(p.id) : undefined,
          name: p.name ?? undefined,
          quantity: p.quantity ?? undefined,
          unitAmount:
            p.unitary_value != null
              ? Math.round(parseDecimal(p.unitary_value)! * 100)
              : undefined,
          totalAmount:
            p.unitary_value != null && p.quantity != null
              ? Math.round(parseDecimal(p.unitary_value)! * (p.quantity ?? 1) * 100)
              : undefined,
        }))
      : undefined

  // Shipment IDs come from tracking or tags.
  const shipmentIds: string[] = []
  if (raw.tracking) shipmentIds.push(raw.tracking)

  return {
    id,
    status: mapOrderStatus(raw.status),
    orderNumber,
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    originAddress: toAddress(raw.from ?? null),
    destinationAddress: toAddress(raw.to ?? null),
    lineItems,
    currency: 'BRL',
    totalAmount,
    discountAmount,
    requestedServiceCode:
      raw.service_code ?? (raw.service_id != null ? String(raw.service_id) : undefined),
    orderAt: toISODate(raw.created_at),
    shippedAt: toISODate(raw.posted_at),
    deliveredAt: toISODate(raw.delivered_at),
    cancelledAt: toISODate(raw.canceled_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
