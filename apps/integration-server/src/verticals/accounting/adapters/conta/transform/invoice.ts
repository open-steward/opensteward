import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ContaLine {
  id: string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  vat_amount?: number
  account_id?: string
  [key: string]: unknown
}

export interface ContaInvoice {
  id: string
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  amount_ex_vat?: number
  vat_amount?: number
  amount_inc_vat?: number
  remaining?: number
  status?: string
  currency?: string
  customer_id?: string
  lines?: ContaLine[]
  [key: string]: unknown
}

function mapStatus(raw: ContaInvoice): InvoiceStatus {
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

function mapLineitem(line: ContaLine): Lineitem {
  return {
    id: line.id,
    accountId: line.account_id || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
    taxAmount: line.vat_amount || undefined,
  }
}

export function transformInvoice(raw: ContaInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_inc_vat,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.remaining,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
