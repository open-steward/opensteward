import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem, Address } from '../../../schema/shared'

export interface AlegraOrderItem {
  id: number
  description: string
  quantity: number
  price: number
  total: number
  tax: number
  productId: string
  discount: number
  [key: string]: unknown
}

export interface AlegraOrder {
  id: number
  clientId: number
  currency: string
  total: number
  date: string
  status: string
  shippingAddress: string
  shippingCity: string
  shippingDepartment: string
  shippingCountry: string
  billingAddress: string
  billingCity: string
  billingDepartment: string
  billingCountry: string
  items: AlegraOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  const s = (status || '').toLowerCase()
  if (s === 'completed' || s === 'invoiced') return 'COMPLETED'
  if (s === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: AlegraOrderItem): Lineitem {
  return {
    id: String(row.id),
    itemId: row.productId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
    discountAmount: row.discount || undefined,
  }
}

function mapShippingAddress(raw: AlegraOrder): Address | undefined {
  if (!raw.shippingAddress && !raw.shippingCity) return undefined
  return {
    address1: raw.shippingAddress || undefined,
    city: raw.shippingCity || undefined,
    region: raw.shippingDepartment || undefined,
    country: raw.shippingCountry || undefined,
  }
}

function mapBillingAddress(raw: AlegraOrder): Address | undefined {
  if (!raw.billingAddress && !raw.billingCity) return undefined
  return {
    address1: raw.billingAddress || undefined,
    city: raw.billingCity || undefined,
    region: raw.billingDepartment || undefined,
    country: raw.billingCountry || undefined,
  }
}

export function transformOrder(raw: AlegraOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.clientId ? String(raw.clientId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    billingAddress: mapBillingAddress(raw),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    clientId: order.contactId ? Number(order.contactId) : undefined,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      productId: li.itemId,
      description: li.itemDescription,
      price: li.unitAmount,
      quantity: li.unitQuantity,
    })),
  }
}
