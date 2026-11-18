import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface TripletexPurchaseOrderLine {
  id: number
  description: string
  count: number
  unitPriceExcludingVat: number
  amountExcludingVat: number
  product?: { id: number; name: string }
}

export interface TripletexPurchaseOrder {
  id: number
  orderDate: string
  supplier?: { id: number; name: string }
  deliveryDate?: string
  amount: number
  currency?: { id: string; code: string }
  isClosed: boolean
  orderLines?: TripletexPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(raw: TripletexPurchaseOrder): PurchaseOrderStatus {
  return raw.isClosed ? 'COMPLETED' : 'ACTIVE'
}

function mapLineitem(line: TripletexPurchaseOrderLine): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.description || undefined,
    itemId: line.product?.id ? String(line.product.id) : undefined,
    unitAmount: line.unitPriceExcludingVat,
    unitQuantity: line.count,
    totalAmount: line.amountExcludingVat,
  }
}

export function transformPurchaseOrder(raw: TripletexPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    contactId: raw.supplier?.id ? String(raw.supplier.id) : undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.amount,
    lineItems: (raw.orderLines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
