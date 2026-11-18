import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface NetvisorSalesOrderLine {
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

export interface NetvisorSalesOrder {
  NetvisorKey: number
  OrderNumber: number
  CustomerIdentifier: string
  Currency: string
  OrderDate: string
  Amount: number
  VatAmount: number
  Status: string
  OrderLines: NetvisorSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
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

function mapLineitem(row: NetvisorSalesOrderLine): Lineitem {
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

export function transformSalesOrder(raw: NetvisorSalesOrder): SalesOrder {
  return {
    id: String(raw.NetvisorKey),
    status: mapStatus(raw.Status),
    contactId: raw.CustomerIdentifier || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    lineItems: (raw.OrderLines ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
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
