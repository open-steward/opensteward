import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface GustoPurchaseOrderLine {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  [key: string]: unknown
}

export interface GustoPurchaseOrder {
  id: string | number
  status: string
  date: string
  vendor_id?: string | number
  total_amount: number
  currency?: string
  lines?: GustoPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'received':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'submitted':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: GustoPurchaseOrderLine): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total_amount,
  }
}

export function transformPurchaseOrder(raw: GustoPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.vendor_id ? String(raw.vendor_id) : undefined,
    currency: raw.currency || 'USD',
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
