import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface AkauntingOrderLine {
  id: number
  item_id: number
  name: string
  description: string
  quantity: number
  price: number
  total: number
  tax: number
  tax_id: number
  [key: string]: unknown
}

export interface AkauntingOrder {
  id: number
  document_number: string
  contact_id: number
  contact_name: string
  currency_code: string
  issued_at: string
  status: string
  amount: number
  tax_total: number
  category_id: number
  items: AkauntingOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  const s = status?.toLowerCase()
  if (s === 'completed' || s === 'invoiced') return 'COMPLETED'
  if (s === 'cancelled' || s === 'voided') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: AkauntingOrderLine): Lineitem {
  return {
    id: String(row.id),
    itemId: row.item_id ? String(row.item_id) : undefined,
    itemDescription: row.description || row.name || undefined,
    unitAmount: row.price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
    taxrateId: row.tax_id ? String(row.tax_id) : undefined,
  }
}

export function transformOrder(raw: AkauntingOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issued_at ? new Date(raw.issued_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    contact_id: order.contactId ? Number(order.contactId) : undefined,
    currency_code: order.currency,
    issued_at: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      item_id: li.itemId ? Number(li.itemId) : undefined,
      description: li.itemDescription,
      price: li.unitAmount,
      quantity: li.unitQuantity,
    })),
  }
}
