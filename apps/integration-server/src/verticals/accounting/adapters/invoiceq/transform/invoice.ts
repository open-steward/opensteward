import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface InvoiceqLineItem {
  item_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  vat_amount?: number
  [key: string]: unknown
}

export interface InvoiceqInvoice {
  id: string
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  sub_total?: number
  vat_amount?: number
  total_amount?: number
  remaining_amount?: number
  status?: string
  customer_id?: string
  currency_code?: string
  line_items?: InvoiceqLineItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status) {
    case 'Draft':
      return 'DRAFT'
    case 'Active':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: InvoiceqLineItem): Lineitem {
  return {
    itemId: item.item_id ? String(item.item_id) : undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.quantity,
    unitAmount: item.unit_price,
    totalAmount: item.total,
    taxAmount: item.vat_amount,
  }
}

export function transformInvoice(raw: InvoiceqInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.remaining_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
