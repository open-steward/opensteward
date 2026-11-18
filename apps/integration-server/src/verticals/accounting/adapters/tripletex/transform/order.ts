import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface TripletexOrderLine {
  id: number
  description: string
  count: number
  unitPriceExcludingVat: number
  amountExcludingVat: number
  product?: { id: number; name: string }
}

export interface TripletexOrder {
  id: number
  orderDate: string
  customer?: { id: number; name: string }
  deliveryDate?: string
  amount: number
  amountExcludingVat: number
  currency?: { id: string; code: string }
  isPrioritizeAmountsIncludingVat: boolean
  isClosed: boolean
  isCompleted: boolean
  orderLines?: TripletexOrderLine[]
  [key: string]: unknown
}

function mapStatus(raw: TripletexOrder): OrderStatus {
  return raw.isClosed || raw.isCompleted ? 'COMPLETED' : 'ACTIVE'
}

function mapLineitem(line: TripletexOrderLine): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.description || undefined,
    itemId: line.product?.id ? String(line.product.id) : undefined,
    unitAmount: line.unitPriceExcludingVat,
    unitQuantity: line.count,
    totalAmount: line.amountExcludingVat,
  }
}

export function transformOrder(raw: TripletexOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    type: 'SALES',
    contactId: raw.customer?.id ? String(raw.customer.id) : undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.amount,
    lineItems: (raw.orderLines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
