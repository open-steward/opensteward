import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress } from '../../shared/transform'
import { ORDER_STATUS_MAP } from '../constants'

export interface TrimbleTruckmateOrderAddressRaw {
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

export interface TrimbleTruckmateOrderLineitemRaw {
  lineId?: string
  itemId?: string
  sku?: string
  description?: string
  name?: string
  quantity?: number
  unitPrice?: number
  totalPrice?: number
  weight?: number
  weightUnit?: string
  [key: string]: unknown
}

export interface TrimbleTruckmateOrderResponse {
  id?: string
  orderId?: string
  orderNumber?: string
  status?: string
  customerId?: string
  clientId?: string
  warehouseId?: string
  tripIds?: string[]
  shipmentIds?: string[]
  origin?: TrimbleTruckmateOrderAddressRaw
  destination?: TrimbleTruckmateOrderAddressRaw
  lineItems?: TrimbleTruckmateOrderLineitemRaw[]
  items?: TrimbleTruckmateOrderLineitemRaw[]
  currency?: string
  subtotalAmount?: number
  taxAmount?: number
  shippingAmount?: number
  discountAmount?: number
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
  const upper = raw.toUpperCase().replace(/[\s-]/g, '_')
  return (ORDER_STATUS_MAP[upper] as OrderStatus) ?? undefined
}

function toOrderAddress(raw: TrimbleTruckmateOrderAddressRaw | undefined) {
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

export function transformOrder(raw: TrimbleTruckmateOrderResponse): Order {
  const id = raw.orderId ?? raw.id ?? undefined
  const lineItems = (raw.lineItems ?? raw.items ?? []).map((li) => ({
    id: li.lineId ?? li.itemId ?? undefined,
    sku: li.sku ?? undefined,
    name: li.name ?? li.description ?? undefined,
    description: li.description ?? undefined,
    quantity: li.quantity ?? undefined,
    unitAmount: li.unitPrice != null ? Math.round(li.unitPrice * 100) : undefined,
    totalAmount: li.totalPrice != null ? Math.round(li.totalPrice * 100) : undefined,
    weight: li.weight != null
      ? {
          value: li.weight,
          unit: (li.weightUnit?.toLowerCase() === 'kg' ? 'kg' : 'lb') as 'kg' | 'lb',
        }
      : undefined,
  }))

  return {
    id,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.orderNumber ?? undefined,
    customerId: raw.customerId ?? raw.clientId ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    shipmentIds: raw.shipmentIds ?? raw.tripIds ?? undefined,
    originAddress: toOrderAddress(raw.origin),
    destinationAddress: toOrderAddress(raw.destination),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    currency: raw.currency ?? undefined,
    subtotalAmount: raw.subtotalAmount != null ? Math.round(raw.subtotalAmount * 100) : undefined,
    taxAmount: raw.taxAmount != null ? Math.round(raw.taxAmount * 100) : undefined,
    shippingAmount: raw.shippingAmount != null ? Math.round(raw.shippingAmount * 100) : undefined,
    discountAmount: raw.discountAmount != null ? Math.round(raw.discountAmount * 100) : undefined,
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
