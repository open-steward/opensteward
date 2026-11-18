import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface TripletexSalesOrderLine {
  id: number
  description: string
  count: number
  unitPriceExcludingVat: number
  amountExcludingVat: number
  product?: { id: number; name: string }
}

export interface TripletexSalesOrder {
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
  orderLines?: TripletexSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(raw: TripletexSalesOrder): SalesOrderStatus {
  return raw.isClosed || raw.isCompleted ? 'COMPLETED' : 'ACTIVE'
}

function mapLineitem(line: TripletexSalesOrderLine): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.description || undefined,
    itemId: line.product?.id ? String(line.product.id) : undefined,
    unitAmount: line.unitPriceExcludingVat,
    unitQuantity: line.count,
    totalAmount: line.amountExcludingVat,
  }
}

export function transformSalesOrder(raw: TripletexSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    contactId: raw.customer?.id ? String(raw.customer.id) : undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.amount,
    lineItems: (raw.orderLines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
