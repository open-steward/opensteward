import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface ProcountorOrderRow {
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

export interface ProcountorOrder {
  id: number
  orderNumber: number
  partnerId: number
  currency: string
  date: string
  sum: number
  vatAmount: number
  status: string
  orderRows: ProcountorOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
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

function mapLineitem(row: ProcountorOrderRow): Lineitem {
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

export function transformOrder(raw: ProcountorOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.partnerId ? String(raw.partnerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    lineItems: (raw.orderRows ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
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
