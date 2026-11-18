import type { Order, OrderStatus } from '../../../schema/order'

export interface AccurateOrderLine {
  id: number
  itemNo: string
  itemName: string
  unitPrice: number
  quantity: number
  amount: number
  [key: string]: unknown
}

export interface AccurateOrder {
  id: number
  number: string
  status: string
  transactionDate: string
  customerNo: string | null
  totalAmount: number
  currencyCode: string | null
  detailItem: AccurateOrderLine[]
  [key: string]: unknown
}

function mapOrderStatus(status: string): OrderStatus {
  switch (status) {
    case 'Open':
      return 'ACTIVE'
    case 'Closed':
      return 'COMPLETED'
    case 'Voided':
    case 'Cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

export function transformOrder(raw: AccurateOrder): Order {
  return {
    id: String(raw.id),
    status: mapOrderStatus(raw.status),
    type: 'SALES',
    contactId: raw.customerNo || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.detailItem ?? []).map((line) => ({
      id: String(line.id),
      itemId: line.itemNo || undefined,
      itemDescription: line.itemName || undefined,
      unitAmount: line.unitPrice,
      unitQuantity: line.quantity,
      totalAmount: line.amount,
    })),
    postedAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
