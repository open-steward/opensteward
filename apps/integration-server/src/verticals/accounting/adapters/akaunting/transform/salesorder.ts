import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface AkauntingSalesOrderLine {
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

export interface AkauntingSalesOrder {
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
  items: AkauntingSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  const s = status?.toLowerCase()
  if (s === 'completed' || s === 'invoiced') return 'COMPLETED'
  if (s === 'cancelled' || s === 'voided') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: AkauntingSalesOrderLine): Lineitem {
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

export function transformSalesOrder(raw: AkauntingSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issued_at ? new Date(raw.issued_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
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
