import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface DineroSalesOrderLine {
  Guid: string
  ProductGuid: string
  Description: string
  Quantity: number
  AccountNumber: number
  BaseAmountValue: number
  TotalAmount: number
  VatAmount: number
  [key: string]: unknown
}

export interface DineroSalesOrder {
  Guid: string
  Number: number
  ContactGuid: string
  Currency: string
  Date: string
  TotalInclVat: number
  TotalVat: number
  Status: string
  OrderLines: DineroSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'Invoiced':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(line: DineroSalesOrderLine): Lineitem {
  return {
    id: line.Guid || undefined,
    accountId: line.AccountNumber ? String(line.AccountNumber) : undefined,
    itemId: line.ProductGuid || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.BaseAmountValue,
    unitQuantity: line.Quantity,
    totalAmount: line.TotalAmount,
    taxAmount: line.VatAmount,
  }
}

export function transformSalesOrder(raw: DineroSalesOrder): SalesOrder {
  return {
    id: raw.Guid,
    status: mapStatus(raw.Status),
    contactId: raw.ContactGuid || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalInclVat,
    lineItems: (raw.OrderLines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    ContactGuid: order.contactId,
    Currency: order.currency,
    Date: toCalendarDate(order.postedAt),
    OrderLines: order.lineItems?.map((li) => ({
      ProductGuid: li.itemId,
      Description: li.itemDescription,
      BaseAmountValue: li.unitAmount,
      Quantity: li.unitQuantity,
      AccountNumber: li.accountId,
    })),
  }
}
