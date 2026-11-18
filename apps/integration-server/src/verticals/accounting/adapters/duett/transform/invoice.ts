import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface DuettLine {
  id: string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  vat?: number
  account_id?: string
  [key: string]: unknown
}

export interface DuettInvoice {
  id: string
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  net?: number
  tax?: number
  gross?: number
  outstanding?: number
  status?: string
  currency?: string
  customer_id?: string
  lines?: DuettLine[]
  [key: string]: unknown
}

function mapStatus(raw: DuettInvoice): InvoiceStatus {
  switch (raw.status?.toLowerCase()) {
    case 'sent':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: DuettLine): Lineitem {
  return {
    id: line.id,
    accountId: line.account_id || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
    taxAmount: line.vat || undefined,
  }
}

export function transformInvoice(raw: DuettInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    taxAmount: raw.tax,
    balanceAmount: raw.outstanding,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
