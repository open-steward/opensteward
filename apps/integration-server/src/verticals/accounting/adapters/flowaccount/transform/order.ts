import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface FlowAccountOrderItem {
  id: string | number
  description: string
  quantity: number
  unitPrice: number
  amount: number
  vatAmount: number
  [key: string]: unknown
}

export interface FlowAccountOrder {
  id: string | number
  documentSerial: string
  statusId: number
  issuedDate: string
  amountTotal: number
  currencyCode: string
  contactCode: string
  items: FlowAccountOrderItem[]
  [key: string]: unknown
}

function mapStatus(statusId: number): OrderStatus {
  switch (statusId) {
    case 3:
      return 'COMPLETED'
    case 4:
      return 'CANCELLED'
    case 2:
      return 'ACTIVE'
    case 1:
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: FlowAccountOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unitPrice,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.vatAmount || undefined,
  }
}

export function transformOrder(raw: FlowAccountOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.statusId),
    type: 'SALES',
    contactId: raw.contactCode || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.amountTotal,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issuedDate ? new Date(raw.issuedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
