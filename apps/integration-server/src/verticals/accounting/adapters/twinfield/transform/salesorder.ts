import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface TwinfieldSalesOrderLine {
  id: string
  article: string
  description: string
  quantity: number
  unitsPriceExcl: number
  valueExcl: number
  valueInc: number
  vatCode: string
  vatValue: number
  dim1: string
  [key: string]: unknown
}

export interface TwinfieldSalesOrder {
  code: string
  orderNumber: string
  customer: string
  currency: string
  orderDate: string
  status: string
  totalExcl: number
  totalIncl: number
  vatTotal: number
  lines: TwinfieldSalesOrderLine[]
  office: string
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  const s = status?.toLowerCase() ?? ''
  if (s === 'final' || s === 'completed') return 'COMPLETED'
  if (s === 'cancelled' || s === 'voided' || s === 'deleted') return 'CANCELLED'
  if (s === 'concept') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: TwinfieldSalesOrderLine): Lineitem {
  return {
    id: row.id,
    accountId: row.dim1 || undefined,
    itemId: row.article || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitsPriceExcl,
    unitQuantity: row.quantity,
    totalAmount: row.valueInc,
    taxAmount: row.vatValue || undefined,
    taxrateId: row.vatCode || undefined,
  }
}

export function transformSalesOrder(raw: TwinfieldSalesOrder): SalesOrder {
  return {
    id: raw.code,
    status: mapStatus(raw.status),
    contactId: raw.customer || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalIncl,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    customer: order.contactId,
    currency: order.currency,
    orderDate: toCalendarDate(order.postedAt),
    lines: order.lineItems?.map((li) => ({
      article: li.itemId,
      description: li.itemDescription,
      unitsPriceExcl: li.unitAmount,
      quantity: li.unitQuantity,
      dim1: li.accountId,
    })),
  }
}
