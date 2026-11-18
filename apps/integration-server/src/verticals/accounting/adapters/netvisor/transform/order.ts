import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface NetvisorOrderLine {
  NetvisorKey: number
  ProductIdentifier: string
  ProductName: string
  Quantity: number
  UnitPrice: number
  LineSum: number
  VatPercent: number
  AccountNumber: string
  [key: string]: unknown
}

export interface NetvisorOrder {
  NetvisorKey: number
  OrderNumber: number
  CustomerIdentifier: string
  Currency: string
  OrderDate: string
  Amount: number
  VatAmount: number
  Status: string
  OrderLines: NetvisorOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'Delivered':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Unsent':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(row: NetvisorOrderLine): Lineitem {
  return {
    id: String(row.NetvisorKey),
    itemId: row.ProductIdentifier || undefined,
    itemDescription: row.ProductName || undefined,
    unitQuantity: row.Quantity,
    unitAmount: row.UnitPrice,
    totalAmount: row.LineSum,
    accountId: row.AccountNumber || undefined,
  }
}

export function transformOrder(raw: NetvisorOrder): Order {
  return {
    id: String(raw.NetvisorKey),
    status: mapStatus(raw.Status),
    type: 'SALES',
    contactId: raw.CustomerIdentifier || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    lineItems: (raw.OrderLines ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    CustomerIdentifier: order.contactId,
    Currency: order.currency,
    OrderDate: toCalendarDate(order.postedAt),
    OrderLines: order.lineItems?.map((li) => ({
      ProductIdentifier: li.itemId,
      ProductName: li.itemDescription,
      UnitPrice: li.unitAmount,
      Quantity: li.unitQuantity,
      AccountNumber: li.accountId,
    })),
  }
}
