import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface AppFolioPurchaseOrderLine {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface AppFolioPurchaseOrder {
  id: string | number
  order_number: string
  vendor_id: string | number
  property_id: string | number
  date: string
  amount: number
  currency: string
  status: string
  line_items: AppFolioPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'active':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AppFolioPurchaseOrderLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformPurchaseOrder(raw: AppFolioPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.vendor_id ? String(raw.vendor_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
