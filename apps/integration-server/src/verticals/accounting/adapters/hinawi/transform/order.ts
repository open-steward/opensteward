import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface HinawiOrderLineItem {
  Id: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  Total: number
  TaxAmount: number
  AccountId: string | number
  [key: string]: unknown
}

export interface HinawiOrder {
  id: string | number
  OrderNo: string
  OrderDate: string
  Status: string
  CustomerId: string | number
  Currency: string
  Total: number
  LineItems: HinawiOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'Draft':
      return 'DRAFT'
    case 'Active':
    case 'Open':
      return 'ACTIVE'
    case 'Completed':
    case 'Paid':
      return 'COMPLETED'
    case 'Cancelled':
    case 'Void':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: HinawiOrderLineItem): Lineitem {
  return {
    id: String(item.Id),
    accountId: item.AccountId ? String(item.AccountId) : undefined,
    itemDescription: item.Description || undefined,
    unitAmount: item.UnitPrice,
    unitQuantity: item.Quantity,
    totalAmount: item.Total,
    taxAmount: item.TaxAmount || undefined,
  }
}

export function transformOrder(raw: HinawiOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    type: 'SALES',
    contactId: raw.CustomerId ? String(raw.CustomerId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    lineItems: (raw.LineItems ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
