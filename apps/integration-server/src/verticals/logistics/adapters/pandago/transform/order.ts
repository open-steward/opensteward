/**
 * pandago order → canonical logistics Order.
 *
 * pandago delivery orders map directly to the canonical Order schema.
 * Each POST /orders creates a delivery request (order) and each GET /orders/{id}
 * returns the current state of that delivery order.
 *
 * pandago timestamps are Unix epoch seconds (integer).
 */
import type { Order, OrderStatus } from '../../../schema/order'
import type { PandagoOrder } from './shipment'

function fromUnixSeconds(val: number | null | undefined): Date | undefined {
  if (val == null) return undefined
  const d = new Date(val * 1000)
  return isNaN(d.getTime()) ? undefined : d
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch (status) {
    case 'NEW':
    case 'RECEIVED':
    case 'WAITING_FOR_TRANSPORT':
      return 'PENDING'
    case 'ASSIGNED_TO_TRANSPORT':
    case 'COURIER_ACCEPTED_DELIVERY':
    case 'NEAR_VENDOR':
    case 'PICKED_UP':
    case 'COURIER_LEFT_VENDOR':
    case 'DELAYED':
    case 'NEAR_CUSTOMER':
      return 'PROCESSING'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CANCELLED':
      return 'CANCELLED'
    case 'RETURNED_TO_VENDOR':
      return 'RETURNED'
    default:
      return 'PENDING'
  }
}

export function transformOrder(raw: PandagoOrder): Order {
  return {
    id: raw.order_id ?? undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.client_order_id ?? undefined,
    shipmentIds: raw.order_id ? [raw.order_id] : undefined,
    originAddress: raw.sender?.location
      ? {
          name: raw.sender.name ?? undefined,
          phone: raw.sender.phone_number ?? undefined,
          street1: raw.sender.location.address ?? undefined,
        }
      : undefined,
    destinationAddress: raw.recipient?.location
      ? {
          name: raw.recipient.name ?? undefined,
          phone: raw.recipient.phone_number ?? undefined,
          street1: raw.recipient.location.address ?? undefined,
        }
      : undefined,
    currency: raw.currency_code ?? undefined,
    shippingAmount: raw.delivery_fee != null ? raw.delivery_fee : undefined,
    notes: raw.description ?? undefined,
    requestedServiceCode: raw.payment_method ?? undefined,
    createdAt: fromUnixSeconds(raw.created_at),
    updatedAt: fromUnixSeconds(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
