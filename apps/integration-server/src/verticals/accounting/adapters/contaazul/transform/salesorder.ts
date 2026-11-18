import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface ContaAzulSalesOrderItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  tax_amount: number
  product_id: string
  discount: number
  [key: string]: unknown
}

export interface ContaAzulSalesOrder {
  id: string
  customer_id: string
  currency: string
  total: number
  date: string
  status: string
  shipping_address: string
  shipping_city: string
  shipping_state: string
  shipping_postal_code: string
  shipping_country: string
  billing_address: string
  billing_city: string
  billing_state: string
  billing_postal_code: string
  billing_country: string
  items: ContaAzulSalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  const s = (status || '').toLowerCase()
  if (s === 'completed' || s === 'invoiced') return 'COMPLETED'
  if (s === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: ContaAzulSalesOrderItem): Lineitem {
  return {
    id: row.id || undefined,
    itemId: row.product_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax_amount || undefined,
    discountAmount: row.discount || undefined,
  }
}

function mapShippingAddress(raw: ContaAzulSalesOrder): Address | undefined {
  if (!raw.shipping_address && !raw.shipping_city) return undefined
  return {
    address1: raw.shipping_address || undefined,
    city: raw.shipping_city || undefined,
    region: raw.shipping_state || undefined,
    postalCode: raw.shipping_postal_code || undefined,
    country: raw.shipping_country || undefined,
  }
}

function mapBillingAddress(raw: ContaAzulSalesOrder): Address | undefined {
  if (!raw.billing_address && !raw.billing_city) return undefined
  return {
    address1: raw.billing_address || undefined,
    city: raw.billing_city || undefined,
    region: raw.billing_state || undefined,
    postalCode: raw.billing_postal_code || undefined,
    country: raw.billing_country || undefined,
  }
}

export function transformSalesOrder(raw: ContaAzulSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.customer_id || undefined,
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
    customer_id: order.contactId,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      product_id: li.itemId,
      description: li.itemDescription,
      unit_price: li.unitAmount,
      quantity: li.unitQuantity,
    })),
  }
}
