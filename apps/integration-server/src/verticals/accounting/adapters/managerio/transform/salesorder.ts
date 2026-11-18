import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface ManagerioSalesOrderLine {
  Item: string
  Description: string
  Qty: number
  UnitPrice: number
  LineTotal: number
  Account: string
  [key: string]: unknown
}

export interface ManagerioSalesOrder {
  Key: string
  Reference: string
  Date: string
  Lines: ManagerioSalesOrderLine[]
  Total: number
  Contact: string
  Currency: string
  Status: string
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'Draft': return 'DRAFT'
    case 'Active': return 'ACTIVE'
    case 'Completed': return 'COMPLETED'
    case 'Cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: ManagerioSalesOrderLine): Lineitem {
  return {
    itemId: line.Item || undefined,
    itemDescription: line.Description || undefined,
    unitQuantity: line.Qty,
    unitAmount: line.UnitPrice,
    totalAmount: line.LineTotal,
    accountId: line.Account || undefined,
  }
}

export function transformSalesOrder(raw: ManagerioSalesOrder): SalesOrder {
  return {
    id: String(raw.Key),
    status: mapStatus(raw.Status),
    contactId: raw.Contact || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(so: Partial<SalesOrder>): Record<string, unknown> {
  return {
    Date: toCalendarDate(so.postedAt),
    Contact: so.contactId,
    Currency: so.currency,
    Lines: so.lineItems?.map((li) => ({
      Item: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      UnitPrice: li.unitAmount,
      Account: li.accountId,
    })),
  }
}
