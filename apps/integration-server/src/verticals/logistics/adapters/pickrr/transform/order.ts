import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress, parseDecimal, nonempty } from '../../shared/transform'

export interface PickrrOrderItem {
  item_name: string | null
  sku: string | null
  quantity: number | null
  unit_price: number | null
  [key: string]: unknown
}

export interface PickrrOrder {
  order_pk: number | string | null
  order_id: string | null
  client_order_id: string | null
  status: string | null
  to_name: string | null
  to_phone_number: string | null
  to_email: string | null
  to_address: string | null
  to_city: string | null
  to_state: string | null
  to_pincode: string | null
  to_country: string | null
  from_name: string | null
  from_phone_number: string | null
  from_address: string | null
  from_city: string | null
  from_state: string | null
  from_pincode: string | null
  from_country: string | null
  item_name: string | null
  tracking_id: string | null
  order_service_used: string | null
  cod_amount: number | null
  total_amount: number | null
  order_items: PickrrOrderItem[] | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null): OrderStatus {
  if (!status) return 'PENDING'
  const s = status.toLowerCase()
  if (s.includes('delivered')) return 'DELIVERED'
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('rto') || s.includes('return')) return 'RETURNED'
  if (s.includes('transit') || s.includes('in-transit') || s.includes('out_for_delivery') || s.includes('dispatched')) return 'SHIPPED'
  if (s.includes('pickup') || s.includes('ready')) return 'AWAITING_SHIPMENT'
  if (s.includes('new') || s.includes('pending')) return 'PENDING'
  return 'PENDING'
}

export function transformOrder(raw: PickrrOrder): Order {
  const lineItems = (raw.order_items ?? []).map((item, idx) => ({
    id: String(idx),
    sku: item.sku ?? undefined,
    name: item.item_name ?? undefined,
    quantity: item.quantity ?? undefined,
    unitAmount: parseDecimal(item.unit_price),
  }))

  const shipmentIds = raw.tracking_id
    ? [raw.tracking_id]
    : []

  return {
    id: String(raw.order_pk ?? raw.order_id ?? ''),
    status: mapOrderStatus(raw.status),
    orderNumber: raw.client_order_id ?? raw.order_id ?? undefined,
    destinationAddress: toAddress({
      name: raw.to_name,
      phone: raw.to_phone_number,
      email: raw.to_email,
      street1: raw.to_address,
      city: raw.to_city,
      state: raw.to_state,
      postalCode: raw.to_pincode,
      country: raw.to_country ?? 'India',
    }),
    originAddress: toAddress({
      name: raw.from_name,
      phone: raw.from_phone_number,
      street1: raw.from_address,
      city: raw.from_city,
      state: raw.from_state,
      postalCode: raw.from_pincode,
      country: raw.from_country ?? 'India',
    }),
    shipmentIds: nonempty(shipmentIds),
    lineItems: nonempty(lineItems),
    totalAmount: parseDecimal(raw.cod_amount ?? raw.total_amount),
    requestedServiceCode: raw.order_service_used ?? undefined,
    orderAt: toISODate(raw.created_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
