import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import { nonempty } from '../../shared/transform'
import type { LucaLineItem } from './invoice'

export interface LucaOrder {
  id: string
  date?: string
  customer_id?: string
  currency?: string
  status?: string
  line_items?: LucaLineItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status?.toLowerCase()) {
    case 'confirmed':
      return 'ACTIVE'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: LucaLineItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_no || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
  }
}

export function transformOrder(raw: LucaOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    lineItems: nonempty((raw.line_items ?? []).map(mapLineitem)),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
