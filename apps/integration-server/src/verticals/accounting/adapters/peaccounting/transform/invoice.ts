import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface PEAccountingInvoiceLine {
  id?: number | string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  tax_amount?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface PEAccountingInvoice {
  id: number | string
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  subtotal?: number
  tax_amount?: number
  total?: number
  amount_due?: number
  status?: string
  contact_id?: number | string
  currency?: string
  lines?: PEAccountingInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status?.toLowerCase()) {
    case 'draft':
      return 'DRAFT'
    case 'sent':
    case 'overdue':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: PEAccountingInvoiceLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformInvoice(raw: PEAccountingInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.amount_due,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
