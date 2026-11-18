/**
 * JDA (Blue Yonder) TMS — load/order → canonical Order.
 *
 * In JDA's Transportation Management System, freight movements are modelled
 * as "loads" (sometimes called "orders" in the planning layer). A load carries
 * origin/destination stop references and a set of shipment legs. We map the
 * load's stop addresses to `originAddress` / `destinationAddress` and the
 * load-level status to the canonical `OrderStatus`.
 *
 * Docs: https://blueyonder.com/solutions/transportation-management
 */
import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress } from '../../shared/transform'

export interface JdaStopAddress {
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

export interface JdaOrderLineitem {
  lineId?: string | null
  itemId?: string | null
  sku?: string | null
  description?: string | null
  quantity?: number | null
  unitPrice?: number | null
  totalPrice?: number | null
  weight?: number | null
  weightUnit?: string | null
  [key: string]: unknown
}

export interface JdaOrderResponse {
  id?: string | null
  orderId?: string | null
  orderNumber?: string | null
  loadNumber?: string | null
  status?: string | null
  customerId?: string | null
  clientId?: string | null
  warehouseId?: string | null
  shipmentIds?: string[] | null
  loadIds?: string[] | null
  origin?: JdaStopAddress | null
  destination?: JdaStopAddress | null
  lineItems?: JdaOrderLineitem[] | null
  items?: JdaOrderLineitem[] | null
  currency?: string | null
  totalAmount?: number | null
  notes?: string | null
  serviceCode?: string | null
  orderDate?: string | null
  shippedDate?: string | null
  deliveredDate?: string | null
  cancelledDate?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapStatus(raw: string | null | undefined): OrderStatus | undefined {
  if (!raw) return undefined
  switch (raw.toUpperCase().replace(/[\s-]/g, '_')) {
    case 'PENDING':
    case 'CREATED':
    case 'NEW':
      return 'PENDING'
    case 'PLANNING':
    case 'PROCESSING':
    case 'IN_PLANNING':
      return 'PROCESSING'
    case 'ON_HOLD':
    case 'HOLD':
      return 'ON_HOLD'
    case 'READY':
    case 'AWAITING_SHIPMENT':
    case 'TENDERED':
      return 'AWAITING_SHIPMENT'
    case 'DISPATCHED':
    case 'IN_TRANSIT':
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

function toStopAddress(raw: JdaStopAddress | null | undefined) {
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

export function transformOrder(raw: JdaOrderResponse): Order {
  const id = raw.orderId ?? raw.id ?? undefined
  const lineItems = (raw.lineItems ?? raw.items ?? []).map((li) => ({
    id: li.lineId ?? li.itemId ?? undefined,
    sku: li.sku ?? undefined,
    name: li.description ?? undefined,
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

  return {
    id,
    status: mapStatus(raw.status),
    orderNumber: raw.orderNumber ?? raw.loadNumber ?? undefined,
    customerId: raw.customerId ?? raw.clientId ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    shipmentIds: raw.shipmentIds ?? raw.loadIds ?? undefined,
    originAddress: toStopAddress(raw.origin),
    destinationAddress: toStopAddress(raw.destination),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    currency: raw.currency ?? undefined,
    totalAmount: raw.totalAmount != null ? Math.round(raw.totalAmount * 100) : undefined,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.serviceCode ?? undefined,
    orderAt: toISODate(raw.orderDate),
    shippedAt: toISODate(raw.shippedDate),
    deliveredAt: toISODate(raw.deliveredDate),
    cancelledAt: toISODate(raw.cancelledDate),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
