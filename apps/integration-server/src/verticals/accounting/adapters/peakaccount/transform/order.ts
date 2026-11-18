import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface PeakAccountOrderItem {
  id: string | number
  description: string
  quantity: number
  unitPrice: number
  amount: number
  vatAmount: number
  [key: string]: unknown
}

export interface PeakAccountOrder {
  id: string | number
  documentNo: string
  status: string
  issueDate: string
  totalAmount: number
  currency: string
  contactId: string | number
  items: PeakAccountOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'paid':
    case 'approved':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'pending':
      return 'ACTIVE'
    case 'draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: PeakAccountOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unitPrice,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.vatAmount || undefined,
  }
}

export function transformOrder(raw: PeakAccountOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.contactId ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
