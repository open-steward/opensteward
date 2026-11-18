import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface ManagerioOrderLine {
  Item: string
  Description: string
  Qty: number
  UnitPrice: number
  LineTotal: number
  Account: string
  [key: string]: unknown
}

export interface ManagerioOrder {
  Key: string
  Reference: string
  Date: string
  Lines: ManagerioOrderLine[]
  Total: number
  Contact: string
  Currency: string
  Status: string
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'Draft': return 'DRAFT'
    case 'Active': return 'ACTIVE'
    case 'Completed': return 'COMPLETED'
    case 'Cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: ManagerioOrderLine): Lineitem {
  return {
    itemId: line.Item || undefined,
    itemDescription: line.Description || undefined,
    unitQuantity: line.Qty,
    unitAmount: line.UnitPrice,
    totalAmount: line.LineTotal,
    accountId: line.Account || undefined,
  }
}

export function transformOrder(raw: ManagerioOrder): Order {
  return {
    id: String(raw.Key),
    status: mapStatus(raw.Status),
    type: 'SALES',
    contactId: raw.Contact || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    Date: toCalendarDate(order.postedAt),
    Contact: order.contactId,
    Currency: order.currency,
    Lines: order.lineItems?.map((li) => ({
      Item: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      UnitPrice: li.unitAmount,
      Account: li.accountId,
    })),
  }
}
