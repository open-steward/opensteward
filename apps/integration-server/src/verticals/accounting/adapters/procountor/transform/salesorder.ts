import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface ProcountorSalesOrderRow {
  id: number
  product: string
  description: string
  quantity: number
  unitPrice: number
  sum: number
  vatPercent: number
  accountNumber: string
  [key: string]: unknown
}

export interface ProcountorSalesOrder {
  id: number
  orderNumber: number
  partnerId: number
  currency: string
  date: string
  sum: number
  vatAmount: number
  status: string
  orderRows: ProcountorSalesOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'DELIVERED':
    case 'COMPLETED':
      return 'COMPLETED'
    case 'CANCELLED':
      return 'CANCELLED'
    case 'EMPTY':
    case 'UNFINISHED':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(row: ProcountorSalesOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountNumber || undefined,
    itemId: row.product || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.sum,
    taxAmount: row.vatPercent,
  }
}

export function transformSalesOrder(raw: ProcountorSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.partnerId ? String(raw.partnerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    lineItems: (raw.orderRows ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    partnerId: order.contactId ? Number(order.contactId) : undefined,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    orderRows: order.lineItems?.map((li) => ({
      product: li.itemId,
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      accountNumber: li.accountId,
    })),
  }
}
