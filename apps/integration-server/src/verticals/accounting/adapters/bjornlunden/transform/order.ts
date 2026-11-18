import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface BlOrderLine {
  Id: string
  ArticleNumber: string
  Description: string
  Quantity: number
  UnitPrice: number
  Amount: number
  VatRate: number
  AccountNumber: number
  [key: string]: unknown
}

export interface BlOrder {
  Id: string
  OrderNumber: number
  CustomerId: string
  Currency: string
  OrderDate: string
  TotalAmount: number
  VatAmount: number
  Status: string
  Lines: BlOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'Completed':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(row: BlOrderLine): Lineitem {
  return {
    id: row.Id || undefined,
    itemId: row.ArticleNumber || undefined,
    itemDescription: row.Description || undefined,
    unitAmount: row.UnitPrice,
    unitQuantity: row.Quantity,
    totalAmount: row.Amount,
    accountId: row.AccountNumber ? String(row.AccountNumber) : undefined,
  }
}

export function transformOrder(raw: BlOrder): Order {
  return {
    id: raw.Id,
    status: mapStatus(raw.Status),
    type: 'SALES',
    contactId: raw.CustomerId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    CustomerId: order.contactId,
    Currency: order.currency,
    OrderDate: toCalendarDate(order.postedAt),
    Lines: order.lineItems?.map((li) => ({
      ArticleNumber: li.itemId,
      Description: li.itemDescription,
      UnitPrice: li.unitAmount,
      Quantity: li.unitQuantity,
      AccountNumber: li.accountId,
    })),
  }
}
