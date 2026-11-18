import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress } from '../../shared/transform'

export interface SapTmOrderAddressRaw {
  name?: string
  company?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
  phone?: string
  email?: string
  [key: string]: unknown
}

export interface SapTmOrderLineItemRaw {
  lineId?: string
  sku?: string
  description?: string
  quantity?: number
  unitPrice?: number
  totalPrice?: number
  weight?: number
  weightUnit?: string
  [key: string]: unknown
}

export interface SapTmOrderResponse {
  id?: string
  orderId?: string
  orderNumber?: string
  status?: string
  customerId?: string
  warehouseId?: string
  shipmentIds?: string[]
  origin?: SapTmOrderAddressRaw
  destination?: SapTmOrderAddressRaw
  lineItems?: SapTmOrderLineItemRaw[]
  currency?: string
  totalAmount?: number
  notes?: string
  serviceType?: string
  orderDate?: string
  shippedDate?: string
  deliveredDate?: string
  cancelledDate?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, OrderStatus> = {
  CREATED: 'PENDING',
  SUBMITTED: 'PROCESSING',
  PLANNED: 'AWAITING_SHIPMENT',
  IN_EXECUTION: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED',
}

function mapStatus(raw: string | undefined): OrderStatus | undefined {
  if (!raw) return undefined
  const upper = raw.toUpperCase().replace(/[\s-]/g, '_')
  return STATUS_MAP[upper] ?? undefined
}

function toOrderAddress(raw: SapTmOrderAddressRaw | undefined) {
  if (!raw) return undefined
  return toAddress({
    name: raw.name,
    company: raw.company,
    street1: raw.address,
    city: raw.city,
    state: raw.state,
    postalCode: raw.zipCode,
    country: raw.country,
    phone: raw.phone,
    email: raw.email,
  })
}

export function transformOrder(raw: SapTmOrderResponse): Order {
  const id = raw.orderId ?? raw.id ?? undefined
  const lineItems = (raw.lineItems ?? []).map((li) => ({
    id: li.lineId ?? undefined,
    sku: li.sku ?? undefined,
    description: li.description ?? undefined,
    quantity: li.quantity ?? undefined,
    unitAmount: li.unitPrice != null ? Math.round(li.unitPrice * 100) : undefined,
    totalAmount: li.totalPrice != null ? Math.round(li.totalPrice * 100) : undefined,
  }))

  return {
    id,
    status: mapStatus(raw.status),
    orderNumber: raw.orderNumber ?? undefined,
    customerId: raw.customerId ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    shipmentIds: raw.shipmentIds ?? undefined,
    originAddress: toOrderAddress(raw.origin),
    destinationAddress: toOrderAddress(raw.destination),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    currency: raw.currency ?? undefined,
    totalAmount: raw.totalAmount != null ? Math.round(raw.totalAmount * 100) : undefined,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.serviceType ?? undefined,
    orderAt: toISODate(raw.orderDate),
    shippedAt: toISODate(raw.shippedDate),
    deliveredAt: toISODate(raw.deliveredDate),
    cancelledAt: toISODate(raw.cancelledDate),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
