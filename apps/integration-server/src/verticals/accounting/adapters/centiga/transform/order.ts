import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import { nonempty } from '../../shared/transform'
import type { CentigaLineItem } from './invoice'

export interface CentigaOrder {
  id: string
  date?: string
  customer_id?: string
  currency?: string
  status?: string
  line_items?: CentigaLineItem[]
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

function mapLineitem(row: CentigaLineItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
  }
}

export function transformOrder(raw: CentigaOrder): Order {
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
