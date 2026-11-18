import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FatouaInvoiceItem {
  id?: string
  description?: string
  qty?: number
  unit_price?: number
  total?: number
  tax_rate?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface FatouaInvoice {
  id: string
  invoice_no?: string
  issue_date?: string
  due_date?: string
  amount_excl_tax?: number
  tax_amount?: number
  total_amount?: number
  paid_amount?: number
  status?: string
  client_id?: string
  currency?: string
  items?: FatouaInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status) {
    case 'pending':
      return 'DRAFT'
    case 'active':
      return 'AUTHORIZED'
    case 'settled':
      return 'PAID'
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: FatouaInvoiceItem): Lineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.qty,
    unitAmount: item.unit_price,
    totalAmount: item.total,
    taxAmount: item.tax_amount,
  }
}

export function transformInvoice(raw: FatouaInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_no || undefined,
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    paidAmount: raw.paid_amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
