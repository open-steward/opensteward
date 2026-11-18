/**
 * Transplace TMS (now Uber Freight) — freight order → canonical Order.
 *
 * In Transplace, freight movements are managed as shipment orders which carry
 * origin/destination stop pairs, commodity detail, and lifecycle status. The
 * canonical `Order` maps the order id, addresses, and status.
 *
 * Docs: https://developer.transplace.com
 */
import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress } from '../../shared/transform'

export interface TransplaceStopAddress {
  name?: string | null
  company?: string | null
  address?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zipCode?: string | null
  postalCode?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export interface TransplaceOrderLineitem {
  lineId?: string | null
  sku?: string | null
  description?: string | null
  quantity?: number | null
  unitPrice?: number | null
  totalPrice?: number | null
  weight?: number | null
  weightUnit?: string | null
  [key: string]: unknown
}

export interface TransplaceOrderResponse {
  id?: string | null
  orderId?: string | null
  orderNumber?: string | null
  referenceNumber?: string | null
  status?: string | null
  customerId?: string | null
  carrierScac?: string | null
  warehouseId?: string | null
  shipmentIds?: string[] | null
  origin?: TransplaceStopAddress | null
  destination?: TransplaceStopAddress | null
  lineItems?: TransplaceOrderLineitem[] | null
  items?: TransplaceOrderLineitem[] | null
  currency?: string | null
  totalAmount?: number | null
  freightCharge?: number | null
  notes?: string | null
  serviceCode?: string | null
  orderDate?: string | null
  pickupDate?: string | null
  deliveryDate?: string | null
  cancelledDate?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapStatus(raw: string | null | undefined): OrderStatus | undefined {
  if (!raw) return undefined
  switch (raw.toUpperCase().replace(/[\s-]/g, '_')) {
    case 'PENDING':
    case 'NEW':
    case 'CREATED':
    case 'DRAFT':
      return 'PENDING'
    case 'PROCESSING':
    case 'IN_PROGRESS':
    case 'TENDERING':
      return 'PROCESSING'
    case 'ON_HOLD':
    case 'HOLD':
      return 'ON_HOLD'
    case 'BOOKED':
    case 'CONFIRMED':
    case 'READY':
    case 'AWAITING_PICKUP':
      return 'AWAITING_SHIPMENT'
    case 'IN_TRANSIT':
    case 'DISPATCHED':
    case 'PICKED_UP':
    case 'SHIPPED':
      return 'SHIPPED'
    case 'DELIVERED':
    case 'COMPLETED':
      return 'DELIVERED'
    case 'CANCELLED':
    case 'CANCELED':
    case 'VOID':
      return 'CANCELLED'
    case 'RETURNED':
      return 'RETURNED'
    default:
      return undefined
  }
}

function toStopAddress(raw: TransplaceStopAddress | null | undefined) {
  if (!raw) return undefined
  return toAddress({
    name: raw.name,
    company: raw.company,
    street1: raw.address,
    street2: raw.address2,
    city: raw.city,
    state: raw.state,
    postalCode: raw.zipCode ?? raw.postalCode,
    country: raw.country,
    phone: raw.phone,
    email: raw.email,
  })
}

export function transformOrder(raw: TransplaceOrderResponse): Order {
  const id = raw.orderId ?? raw.id ?? undefined
  const lineItems = (raw.lineItems ?? raw.items ?? []).map((li) => ({
    id: li.lineId ?? undefined,
    sku: li.sku ?? undefined,
    description: li.description ?? undefined,
    quantity: li.quantity ?? undefined,
    unitAmount: li.unitPrice != null ? Math.round(li.unitPrice * 100) : undefined,
    totalAmount: li.totalPrice != null ? Math.round(li.totalPrice * 100) : undefined,
    weight:
      li.weight != null
        ? {
            value: li.weight,
            unit: (
              typeof li.weightUnit === 'string' && li.weightUnit.toLowerCase() === 'kg'
                ? 'kg'
                : 'lb'
            ) as 'kg' | 'lb',
          }
        : undefined,
  }))

  const totalAmount =
    raw.totalAmount != null
      ? Math.round(raw.totalAmount * 100)
      : raw.freightCharge != null
        ? Math.round(raw.freightCharge * 100)
        : undefined

  return {
    id,
    status: mapStatus(raw.status),
    orderNumber: raw.orderNumber ?? raw.referenceNumber ?? undefined,
    customerId: raw.customerId ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    shipmentIds: raw.shipmentIds ?? undefined,
    originAddress: toStopAddress(raw.origin),
    destinationAddress: toStopAddress(raw.destination),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    currency: raw.currency ?? undefined,
    totalAmount,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.serviceCode ?? raw.carrierScac ?? undefined,
    orderAt: toISODate(raw.orderDate),
    shippedAt: toISODate(raw.pickupDate),
    deliveredAt: toISODate(raw.deliveryDate),
    cancelledAt: toISODate(raw.cancelledDate),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
