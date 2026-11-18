import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate, parseDecimal, nonempty } from '../../shared/transform'

export interface ShipKaroOrderItem {
  id?: number | null
  name?: string | null
  sku?: string | null
  quantity?: number | null
  selling_price?: number | null
  hsn?: string | null
  [key: string]: unknown
}

export interface ShipKaroOrder {
  id?: number | string | null
  order_id?: string | null
  channel_order_id?: string | null
  status?: string | null
  customer_name?: string | null
  customer_email?: string | null
  customer_phone?: string | null
  shipping_name?: string | null
  shipping_address?: string | null
  shipping_address_2?: string | null
  shipping_city?: string | null
  shipping_state?: string | null
  shipping_pincode?: string | null
  shipping_country?: string | null
  shipping_phone?: string | null
  shipping_email?: string | null
  billing_name?: string | null
  billing_address?: string | null
  billing_address_2?: string | null
  billing_city?: string | null
  billing_state?: string | null
  billing_pincode?: string | null
  billing_country?: string | null
  billing_phone?: string | null
  billing_email?: string | null
  items?: ShipKaroOrderItem[] | null
  order_items?: ShipKaroOrderItem[] | null
  payment_method?: string | null
  sub_total?: number | null
  shipping_charges?: number | null
  discount?: number | null
  total?: number | null
  courier_name?: string | null
  awb_code?: string | null
  pickup_location?: string | null
  order_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'NEW':
    case 'PENDING':
      return 'PENDING'
    case 'PROCESSING':
      return 'PROCESSING'
    case 'READY_TO_SHIP':
    case 'PICKUP_SCHEDULED':
    case 'PICKUP_QUEUED':
      return 'AWAITING_SHIPMENT'
    case 'PICKED_UP':
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
      return 'SHIPPED'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CANCELLED':
    case 'CANCELED':
      return 'CANCELLED'
    case 'RTO_INITIATED':
    case 'RTO_DELIVERED':
    case 'RETURNED':
      return 'RETURNED'
    default:
      return 'PENDING'
  }
}

export function transformOrder(raw: ShipKaroOrder): Order {
  const rawItems = raw.items ?? raw.order_items ?? []
  const lineItems = rawItems.map((item) => ({
    id: item.id != null ? String(item.id) : undefined,
    sku: item.sku ?? undefined,
    name: item.name ?? undefined,
    quantity: item.quantity ?? undefined,
    unitAmount: parseDecimal(item.selling_price),
  }))

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.channel_order_id ?? raw.order_id ?? undefined,
    destinationAddress: toAddress({
      name: raw.shipping_name ?? raw.customer_name,
      street1: raw.shipping_address,
      street2: raw.shipping_address_2,
      city: raw.shipping_city,
      state: raw.shipping_state,
      postalCode: raw.shipping_pincode,
      country: raw.shipping_country,
      phone: raw.shipping_phone ?? raw.customer_phone,
      email: raw.shipping_email ?? raw.customer_email,
    }),
    originAddress: toAddress({
      name: raw.billing_name,
      street1: raw.billing_address,
      street2: raw.billing_address_2,
      city: raw.billing_city,
      state: raw.billing_state,
      postalCode: raw.billing_pincode,
      country: raw.billing_country,
      phone: raw.billing_phone,
      email: raw.billing_email,
    }),
    lineItems: nonempty(lineItems),
    subtotalAmount: parseDecimal(raw.sub_total),
    shippingAmount: parseDecimal(raw.shipping_charges),
    discountAmount: parseDecimal(raw.discount),
    totalAmount: parseDecimal(raw.total),
    requestedServiceCode: raw.courier_name ?? undefined,
    notes: raw.pickup_location ?? undefined,
    orderAt: toISODate(raw.order_date),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
