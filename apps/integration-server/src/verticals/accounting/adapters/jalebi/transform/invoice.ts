import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface JalebiOrderItem {
  id: string | number
  name: string
  description: string
  quantity: number
  unit_price: number
  total: number
  tax_amount: number
  [key: string]: unknown
}

export interface JalebiOrder {
  id: string | number
  order_number: string
  created_at: string
  due_date: string
  subtotal: number
  tax_total: number
  grand_total: number
  amount_due: number
  status: string
  customer_id: string | number
  currency: string
  items: JalebiOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'pending':
      return 'DRAFT'
    case 'confirmed':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: JalebiOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemName: item.name || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.total,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformInvoice(raw: JalebiOrder): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.order_number || undefined,
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grand_total,
    taxAmount: raw.tax_total,
    balanceAmount: raw.amount_due,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.created_at ? new Date(raw.created_at) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
