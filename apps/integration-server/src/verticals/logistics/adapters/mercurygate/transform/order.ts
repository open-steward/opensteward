import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress } from '../../shared/transform'

export interface MercuryGateOrderAddressRaw {
  name?: string
  company?: string
  address?: string
  address2?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
  phone?: string
  email?: string
  [key: string]: unknown
}

export interface MercuryGateOrderLineitemRaw {
  id?: string
  sku?: string
  description?: string
  quantity?: number
  unitPrice?: number
  weight?: number
  weightUnit?: string
  [key: string]: unknown
}

export interface MercuryGateOrderResponse {
  id?: string
  orderId?: string
  orderNumber?: string
  status?: string
  customerId?: string
  warehouseId?: string
  shipmentIds?: string[]
  origin?: MercuryGateOrderAddressRaw
  destination?: MercuryGateOrderAddressRaw
  lineItems?: MercuryGateOrderLineitemRaw[]
  items?: MercuryGateOrderLineitemRaw[]
  currency?: string
  subtotalAmount?: number
  taxAmount?: number
  shippingAmount?: number
  totalAmount?: number
  notes?: string
  serviceCode?: string
  serviceType?: string
  orderDate?: string
  shippedDate?: string
  deliveredDate?: string
  cancelledDate?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapOrderStatus(raw: string | undefined): OrderStatus | undefined {
  if (!raw) return undefined
  switch (raw.toUpperCase()) {
    case 'PENDING':
    case 'NEW':
      return 'PENDING'
    case 'PROCESSING':
    case 'IN_PROCESS':
      return 'PROCESSING'
    case 'ON_HOLD':
      return 'ON_HOLD'
    case 'AWAITING_SHIPMENT':
    case 'READY_TO_SHIP':
      return 'AWAITING_SHIPMENT'
    case 'SHIPPED':
    case 'IN_TRANSIT':
      return 'SHIPPED'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CANCELLED':
    case 'CANCELED':
      return 'CANCELLED'
    case 'RETURNED':
      return 'RETURNED'
    default:
      return undefined
  }
}

function toOrderAddress(raw: MercuryGateOrderAddressRaw | undefined) {
  if (!raw) return undefined
  return toAddress({
    name: raw.name,
    company: raw.company,
    street1: raw.address,
    street2: raw.address2,
    city: raw.city,
    state: raw.state,
    postalCode: raw.zipCode,
    country: raw.country,
    phone: raw.phone,
    email: raw.email,
  })
}

export function transformOrder(raw: MercuryGateOrderResponse): Order {
  const id = raw.orderId ?? raw.id ?? undefined
  const lineItems = (raw.lineItems ?? raw.items ?? []).map((li) => ({
    id: li.id ?? undefined,
    sku: li.sku ?? undefined,
    name: li.description ?? undefined,
    quantity: li.quantity ?? undefined,
    unitAmount: li.unitPrice != null ? Math.round(li.unitPrice * 100) : undefined,
  }))

  return {
    id,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.orderNumber ?? undefined,
    customerId: raw.customerId ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    shipmentIds: raw.shipmentIds ?? undefined,
    originAddress: toOrderAddress(raw.origin),
    destinationAddress: toOrderAddress(raw.destination),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    currency: raw.currency ?? undefined,
    subtotalAmount: raw.subtotalAmount != null ? Math.round(raw.subtotalAmount * 100) : undefined,
    taxAmount: raw.taxAmount != null ? Math.round(raw.taxAmount * 100) : undefined,
    shippingAmount: raw.shippingAmount != null ? Math.round(raw.shippingAmount * 100) : undefined,
    totalAmount: raw.totalAmount != null ? Math.round(raw.totalAmount * 100) : undefined,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.serviceCode ?? raw.serviceType ?? undefined,
    orderAt: toISODate(raw.orderDate),
    shippedAt: toISODate(raw.shippedDate),
    deliveredAt: toISODate(raw.deliveredDate),
    cancelledAt: toISODate(raw.cancelledDate),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
