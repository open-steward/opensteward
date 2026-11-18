import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, parseDecimal } from '../../shared/transform'

// POST /services/shipment/order (create) response envelope
// GET  /services/shipment/v2/{tracking_order} response envelope
export interface GhtkOrderRaw {
  // Create-order response (nested under "order")
  partner_id?: string | null       // partner's order code (id sent in request)
  label?: string | null            // GHTK tracking code
  fee?: string | number | null     // shipping fee (VNĐ)
  tracking_id?: number | null      // GHTK internal numeric id

  // Tracking/status response (top-level)
  label_id?: string | null         // GHTK shipment identifier
  status?: string | number | null  // numeric status code (1–13 etc.)
  status_text?: string | null
  created?: string | null
  modified?: string | null
  message?: string | null
  pick_date?: string | null
  deliver_date?: string | null
  customer_fullname?: string | null
  customer_tel?: string | null
  address?: string | null
  ship_money?: number | null
  insurance?: number | null
  value?: number | null
  weight?: number | null           // grams
  pick_money?: number | null       // COD amount

  [key: string]: unknown
}

// GHTK numeric order status codes (from their documentation)
function mapOrderStatus(status: string | number | null | undefined): OrderStatus {
  if (status === null || status === undefined) return 'UNKNOWN'
  const s = typeof status === 'string' ? status.toUpperCase() : String(status)
  // Numeric codes from GHTK docs: -1=cancel, 1=not_pick, 2=picking, 3=return, 4=returning,
  // 5=returned, 6=delivered, 7=delivering, 8=delivered, 9=compensated, 10=wait_return,
  // 11=exception, 12=lost
  if (s === '-1') return 'CANCELLED'
  if (s === '1' || s === 'NOT_PICK') return 'PENDING'
  if (s === '2' || s.includes('PICKING') || s.includes('PROCESSING')) return 'PROCESSING'
  if (s === '3' || s === '4' || s.includes('RETURN')) return 'RETURNED'
  if (s === '6' || s === '8' || s.includes('DELIVERED')) return 'DELIVERED'
  if (s === '7' || s.includes('DELIVERING') || s.includes('TRANSIT') || s.includes('SHIPPED')) return 'SHIPPED'
  if (s === '5' || s.includes('RETURNED')) return 'RETURNED'
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('HOLD') || s.includes('WAIT')) return 'ON_HOLD'
  return 'UNKNOWN'
}

export function transformOrder(raw: GhtkOrderRaw): Order {
  const id = raw.label_id ?? raw.label ?? raw.partner_id ?? String(raw.tracking_id ?? '')
  return {
    id: id || undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.partner_id ?? undefined,
    destinationAddress: (raw.customer_fullname || raw.customer_tel || raw.address)
      ? {
          name: raw.customer_fullname ?? undefined,
          phone: raw.customer_tel ?? undefined,
          street1: raw.address ?? undefined,
        }
      : undefined,
    totalAmount: raw.ship_money != null ? parseDecimal(raw.ship_money) : undefined,
    notes: raw.message ?? undefined,
    orderAt: toISODate(raw.created),
    shippedAt: toISODate(raw.pick_date),
    deliveredAt: toISODate(raw.deliver_date),
    createdAt: toISODate(raw.created),
    updatedAt: toISODate(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}
