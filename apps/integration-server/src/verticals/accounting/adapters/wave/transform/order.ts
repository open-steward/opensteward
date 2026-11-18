import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface WaveOrderItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  account: { id: string } | null
  taxes: { amount: number; salesTax: { id: string; name: string; rate: number } }[]
  [key: string]: unknown
}

export interface WaveOrder {
  id: string
  orderNumber: string
  customer: { id: string } | null
  currency: { code: string } | null
  totalAmount: number
  taxAmount: number
  orderDate: string
  status: string
  items: WaveOrderItem[]
  createdAt: string
  modifiedAt: string
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  const s = status.toUpperCase()
  if (s === 'COMPLETED' || s === 'INVOICED') return 'COMPLETED'
  if (s === 'CANCELLED' || s === 'VOIDED') return 'CANCELLED'
  if (s === 'DRAFT') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: WaveOrderItem): Lineitem {
  const taxAmount = row.taxes?.reduce((sum, t) => sum + (t.amount ?? 0), 0) || undefined
  return {
    id: row.id,
    accountId: row.account?.id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount,
  }
}

export function transformOrder(raw: WaveOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.customer?.id || undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.modifiedAt ? new Date(raw.modifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    customer: order.contactId ? { id: order.contactId } : undefined,
    currency: order.currency ? { code: order.currency } : undefined,
    orderDate: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      account: li.accountId ? { id: li.accountId } : undefined,
    })),
  }
}
