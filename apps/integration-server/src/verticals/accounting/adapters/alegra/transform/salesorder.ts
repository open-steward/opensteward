import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface AlegraSalesOrderItem {
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

export interface AlegraSalesOrder {
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
  items: AlegraSalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  const s = (status || '').toLowerCase()
  if (s === 'completed' || s === 'invoiced') return 'COMPLETED'
  if (s === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: AlegraSalesOrderItem): Lineitem {
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

function mapShippingAddress(raw: AlegraSalesOrder): Address | undefined {
  if (!raw.shippingAddress && !raw.shippingCity) return undefined
  return {
    address1: raw.shippingAddress || undefined,
    city: raw.shippingCity || undefined,
    region: raw.shippingDepartment || undefined,
    country: raw.shippingCountry || undefined,
  }
}

function mapBillingAddress(raw: AlegraSalesOrder): Address | undefined {
  if (!raw.billingAddress && !raw.billingCity) return undefined
  return {
    address1: raw.billingAddress || undefined,
    city: raw.billingCity || undefined,
    region: raw.billingDepartment || undefined,
    country: raw.billingCountry || undefined,
  }
}

export function transformSalesOrder(raw: AlegraSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
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

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
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
