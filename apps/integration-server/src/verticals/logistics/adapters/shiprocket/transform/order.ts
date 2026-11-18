import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress, parseDecimal, nonempty } from '../../shared/transform'

export interface ShiprocketOrderProduct {
  id: number
  name: string | null
  sku: string | null
  units: number | null
  selling_price: number | null
  hsn: string | null
  [key: string]: unknown
}

export interface ShiprocketOrder {
  id: number
  channel_order_id: string | null
  order_id: string | null
  status: string | null
  status_code: number | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  shipping_address: string | null
  shipping_address_2: string | null
  shipping_city: string | null
  shipping_state: string | null
  shipping_pincode: string | null
  shipping_country: string | null
  billing_address: string | null
  billing_address_2: string | null
  billing_city: string | null
  billing_state: string | null
  billing_pincode: string | null
  billing_country: string | null
  billing_customer_name: string | null
  billing_phone: string | null
  billing_email: string | null
  order_items: ShiprocketOrderProduct[] | null
  shipments: Array<{ id: number; [key: string]: unknown }> | null
  payment_method: string | null
  sub_total: number | null
  shipping_charges: number | null
  discount: number | null
  total: number | null
  channel_id: number | null
  channel_name: string | null
  courier_name: string | null
  awb_code: string | null
  pickup_location: string | null
  order_date: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null): OrderStatus {
  switch (status) {
    case 'NEW':              return 'PENDING'
    case 'READY_TO_SHIP':    return 'AWAITING_SHIPMENT'
    case 'PICKUP_SCHEDULED': return 'AWAITING_SHIPMENT'
    case 'PICKUP_QUEUED':    return 'AWAITING_SHIPMENT'
    case 'PICKED_UP':        return 'SHIPPED'
    case 'IN_TRANSIT':       return 'SHIPPED'
    case 'OUT_FOR_DELIVERY': return 'SHIPPED'
    case 'DELIVERED':        return 'DELIVERED'
    case 'CANCELLED':        return 'CANCELLED'
    case 'RTO_INITIATED':    return 'RETURNED'
    case 'RTO_DELIVERED':    return 'RETURNED'
    default:                 return 'PENDING'
  }
}

export function transformOrder(raw: ShiprocketOrder): Order {
  const lineItems = (raw.order_items ?? []).map((item) => ({
    id: String(item.id),
    sku: item.sku ?? undefined,
    name: item.name ?? undefined,
    quantity: item.units ?? undefined,
    unitAmount: parseDecimal(item.selling_price),
  }))

  const shipmentIds = nonempty(
    (raw.shipments ?? []).map((s) => String(s.id)),
  )

  return {
    id: String(raw.id),
    status: mapOrderStatus(raw.status),
    orderNumber: raw.channel_order_id ?? raw.order_id ?? undefined,
    destinationAddress: toAddress({
      name: raw.customer_name,
      street1: raw.shipping_address,
      street2: raw.shipping_address_2,
      city: raw.shipping_city,
      state: raw.shipping_state,
      postalCode: raw.shipping_pincode,
      country: raw.shipping_country,
      phone: raw.customer_phone,
      email: raw.customer_email,
    }),
    shipmentIds,
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
