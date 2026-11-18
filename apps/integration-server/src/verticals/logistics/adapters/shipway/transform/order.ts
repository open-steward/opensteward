/**
 * Shipway REST API — /api/getOrderShipmentDetails + /api/pushOrderData → canonical Order.
 *
 * POST https://shipway.in/api/pushOrderData        (create/push an order to Shipway)
 * POST https://shipway.in/api/getOrderShipmentDetails  (get an order by order_id)
 *
 * Response fields come from Shipway v1.3 API docs (pushOrderData parameters used
 * as the canonical field names since getOrderShipmentDetails mirrors them).
 *
 * Docs: https://shipway.in/plugins/shipway-order-tracking-notify/Shipway_Docs_for_client_v_1.3.pdf
 */
import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

// ─── Shipway raw types ─────────────────────────────────────────────────────

export interface ShipwayOrderRaw {
  order_id?: string | null
  awb?: string | null
  carrier_id?: string | null
  courier_id?: string | null
  status?: string | null
  current_status?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  products?: string | null
  company?: string | null
  created_at?: string | null
  updated_at?: string | null
  expected_delivery?: string | null
  delivered_at?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
  country?: string | null
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s.includes('DELIVERED')) return 'DELIVERED'
  if (s.includes('SHIPPED') || s.includes('IN_TRANSIT') || s.includes('TRANSIT')) return 'SHIPPED'
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('RETURN')) return 'RETURNED'
  if (s.includes('PENDING')) return 'PENDING'
  if (s.includes('PROCESSING')) return 'PROCESSING'
  if (s.includes('CREATED') || s.includes('MANIFEST') || s.includes('LABEL')) return 'AWAITING_SHIPMENT'
  return 'UNKNOWN'
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformOrder(raw: ShipwayOrderRaw): Order {
  const status = raw.current_status ?? raw.status

  const firstName = raw.first_name ?? ''
  const lastName = raw.last_name ?? ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined

  return {
    id: raw.order_id ?? undefined,
    status: mapOrderStatus(status),
    orderNumber: raw.order_id ?? undefined,
    destinationAddress: (raw.city || raw.state || raw.pincode || raw.country || raw.email || raw.phone || fullName)
      ? {
          name: fullName,
          city: raw.city ?? undefined,
          state: raw.state ?? undefined,
          postalCode: raw.pincode ?? undefined,
          country: raw.country ?? undefined,
          email: raw.email ?? undefined,
          phone: raw.phone ?? undefined,
        }
      : undefined,
    notes: raw.products ?? undefined,
    deliveredAt: toISODate(raw.delivered_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
