import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface TwinfieldOrderLine {
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

export interface TwinfieldOrder {
  code: string
  orderNumber: string
  customer: string
  currency: string
  orderDate: string
  status: string
  totalExcl: number
  totalIncl: number
  vatTotal: number
  lines: TwinfieldOrderLine[]
  office: string
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  const s = status?.toLowerCase() ?? ''
  if (s === 'final' || s === 'completed') return 'COMPLETED'
  if (s === 'cancelled' || s === 'voided' || s === 'deleted') return 'CANCELLED'
  if (s === 'concept') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: TwinfieldOrderLine): Lineitem {
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

export function transformOrder(raw: TwinfieldOrder): Order {
  return {
    id: raw.code,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.customer || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalIncl,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
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
