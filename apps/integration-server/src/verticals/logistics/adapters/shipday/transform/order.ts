import type { Order, OrderStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * Shipday delivery order as returned by GET /orders and GET /orders/{ordernumber}.
 * Field names come from the official Shipday REST API and SDK.
 */
export interface ShipdayOrder {
  orderId?: number | null
  orderNumber?: string | null
  companyId?: number | null
  areaId?: number | null
  status?: string | null
  // Customer delivery address
  customerName?: string | null
  customerAddress?: string | null
  customerEmail?: string | null
  customerPhoneNumber?: string | null
  // Pickup / origin
  pickupName?: string | null
  pickupPhoneNumber?: string | null
  pickupAddress?: {
    street?: string | null
    city?: string | null
    state?: string | null
    zip?: string | null
    country?: string | null
    latitude?: number | null
    longitude?: number | null
  } | null
  // Customer (delivery) address as nested object (alternate shape)
  customer?: {
    name?: string | null
    email?: string | null
    phone_number?: string | null
    address?: {
      street?: string | null
      city?: string | null
      state?: string | null
      zip?: string | null
      country?: string | null
      latitude?: number | null
      longitude?: number | null
    } | null
    latitude?: number | null
    longitude?: number | null
  } | null
  pickup?: {
    name?: string | null
    phone_number?: string | null
    address?: {
      street?: string | null
      city?: string | null
      state?: string | null
      zip?: string | null
      country?: string | null
    } | null
  } | null
  orderItems?: Array<{
    name?: string | null
    unit_price?: number | null
    quantity?: number | null
  }> | null
  assignedDriver?: {
    id?: number | null
    name?: string | null
  } | null
  // Activity / timestamps
  expectedDeliveryDate?: string | null
  expectedPickupDate?: string | null
  deliveryTime?: string | null
  pickupTime?: string | null
  orderTime?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  distance?: number | null
  totalOrderCost?: number | null
  tipAmount?: number | null
  [key: string]: unknown
}

function mapStatus(raw: string | null | undefined): OrderStatus {
  if (!raw) return 'PENDING'
  const s = String(raw).toUpperCase()
  if (s === 'ASSIGNED' || s === 'STARTED' || s === 'ACCEPTED') return 'PROCESSING'
  if (s === 'PICKED_UP' || s === 'IN_TRANSIT' || s === 'OUT_FOR_DELIVERY') return 'SHIPPED'
  if (s === 'DELIVERED') return 'DELIVERED'
  if (s === 'CANCELLED' || s === 'CANCELED') return 'CANCELLED'
  if (s === 'RETURNED') return 'RETURNED'
  if (s === 'AWAITING' || s === 'READY_TO_SHIP') return 'AWAITING_SHIPMENT'
  return 'PENDING'
}

function toDeliveryAddress(raw: ShipdayOrder): Address | undefined {
  // Prefer nested customer.address over flat fields
  const cust = raw.customer
  if (cust?.address) {
    const a = cust.address
    const addr: Address = {
      name: cust.name ?? raw.customerName ?? undefined,
      street1: a.street ?? undefined,
      city: a.city ?? undefined,
      state: a.state ?? undefined,
      postalCode: a.zip ?? undefined,
      country: a.country ?? undefined,
      phone: cust.phone_number ?? raw.customerPhoneNumber ?? undefined,
      email: cust.email ?? raw.customerEmail ?? undefined,
    }
    const hasAny = Object.values(addr).some(v => v !== undefined)
    return hasAny ? addr : undefined
  }
  if (raw.customerAddress) {
    return {
      name: raw.customerName ?? undefined,
      street1: raw.customerAddress,
      phone: raw.customerPhoneNumber ?? undefined,
      email: raw.customerEmail ?? undefined,
    }
  }
  return undefined
}

function toOriginAddress(raw: ShipdayOrder): Address | undefined {
  // Prefer nested pickup.address over flat pickupAddress
  const pickup = raw.pickup
  if (pickup?.address) {
    const a = pickup.address
    const addr: Address = {
      name: pickup.name ?? raw.pickupName ?? undefined,
      street1: a.street ?? undefined,
      city: a.city ?? undefined,
      state: a.state ?? undefined,
      postalCode: a.zip ?? undefined,
      country: a.country ?? undefined,
      phone: pickup.phone_number ?? raw.pickupPhoneNumber ?? undefined,
    }
    const hasAny = Object.values(addr).some(v => v !== undefined)
    return hasAny ? addr : undefined
  }
  const pa = raw.pickupAddress
  if (pa) {
    return {
      name: raw.pickupName ?? undefined,
      street1: pa.street ?? undefined,
      city: pa.city ?? undefined,
      state: pa.state ?? undefined,
      postalCode: pa.zip ?? undefined,
      country: pa.country ?? undefined,
      phone: raw.pickupPhoneNumber ?? undefined,
    }
  }
  return undefined
}

export function transformOrder(raw: ShipdayOrder): Order {
  return {
    id: raw.orderId != null ? String(raw.orderId) : (raw.orderNumber ?? undefined),
    orderNumber: raw.orderNumber ?? undefined,
    status: mapStatus(raw.status),
    destinationAddress: toDeliveryAddress(raw),
    originAddress: toOriginAddress(raw),
    totalAmount: raw.totalOrderCost != null ? Math.round(raw.totalOrderCost * 100) : undefined,
    deliveredAt: toISODate(raw.deliveryTime ?? raw.expectedDeliveryDate),
    orderAt: toISODate(raw.orderTime ?? raw.createdAt),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
