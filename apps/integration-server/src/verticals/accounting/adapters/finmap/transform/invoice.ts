import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FinmapInvoiceItem {
  id: string
  name: string
  price: number
  count: number
  total: number
  tax?: number
  [key: string]: unknown
}

export interface FinmapInvoice {
  id: string
  name: string
  date: string
  dueDate?: string
  amount: number
  amountWithTax?: number
  taxAmount?: number
  status: string
  counterpartyId?: string
  currency?: string
  items?: FinmapInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'active':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'deleted':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: FinmapInvoiceItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.name || undefined,
    unitAmount: item.price,
    unitQuantity: item.count,
    totalAmount: item.total,
    taxAmount: item.tax || undefined,
  }
}

export function transformInvoice(raw: FinmapInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.name || undefined,
    contactId: raw.counterpartyId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amountWithTax ?? raw.amount,
    taxAmount: raw.taxAmount || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
