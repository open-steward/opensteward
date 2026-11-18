import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface EconomicOrderLine {
  lineNumber: number
  description: string
  product: { productNumber: string; name: string } | null
  quantity: number
  unitNetPrice: number
  totalNetAmount: number
  [key: string]: unknown
}

export interface EconomicOrder {
  orderNumber: number
  date: string
  currency: string
  netAmount: number
  grossAmount: number
  customer: { customerNumber: number; name: string } | null
  lines: EconomicOrderLine[]
  isArchived: boolean
  isSent: boolean
  [key: string]: unknown
}

function mapStatus(order: EconomicOrder): OrderStatus {
  if (order.isArchived) return 'COMPLETED'
  return 'ACTIVE'
}

function mapLineitem(row: EconomicOrderLine): Lineitem {
  return {
    id: String(row.lineNumber),
    itemId: row.product?.productNumber || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitNetPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalNetAmount,
  }
}

export function transformOrder(raw: EconomicOrder): Order {
  return {
    id: String(raw.orderNumber),
    status: mapStatus(raw),
    type: 'SALES',
    contactId: raw.customer?.customerNumber ? String(raw.customer.customerNumber) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
