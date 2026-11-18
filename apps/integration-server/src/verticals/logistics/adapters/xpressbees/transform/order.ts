import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

// Xpressbees order (shipment booking) response
// POST shipments2/create
// Response includes AWB, status, label_url, consignee/consigner addresses

export interface XpressbeesOrderRaw {
  id?: string | number | null
  order_id?: string | null
  awb_number?: string | null
  status?: string | null
  courier_id?: string | number | null
  courier_name?: string | null
  consignee?: Record<string, unknown> | null
  consigner?: Record<string, unknown> | null
  products?: Array<Record<string, unknown>> | null
  cod_amount?: number | null
  total_amount?: number | null
  payment_method?: string | null
  label_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface XpressbeesOrderListResponse {
  status?: boolean | null
  data?: XpressbeesOrderRaw[] | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'PENDING'
  const s = status.toUpperCase()
  if (s.includes('DELIVERED')) return 'DELIVERED'
  if (s.includes('SHIPPED') || s.includes('DISPATCH')) return 'SHIPPED'
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('RETURN')) return 'RETURNED'
  if (s.includes('HOLD')) return 'ON_HOLD'
  if (s.includes('PROCESSING') || s.includes('BOOKED')) return 'PROCESSING'
  if (s.includes('AWAITIN') || s.includes('PICKUP') || s.includes('MANIFEST')) return 'AWAITING_SHIPMENT'
  return 'PENDING'
}

export function transformOrder(raw: XpressbeesOrderRaw): Order {
  return {
    id: raw.id != null ? String(raw.id) : (raw.order_id ?? undefined),
    orderNumber: raw.order_id ?? (raw.awb_number ?? undefined),
    status: mapOrderStatus(raw.status),
    originAddress: toAddress(raw.consigner),
    destinationAddress: toAddress(raw.consignee),
    totalAmount: raw.total_amount ?? (raw.cod_amount ?? undefined),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
