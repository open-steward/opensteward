import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface MazeedOneLine {
  id: string | number
  description: string
  qty: number
  unit_price: number
  total: number
  vat_amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface MazeedOneInvoice {
  id: string | number
  invoice_no: string
  invoice_date: string
  due_date: string
  subtotal: number
  vat_amount: number
  total: number
  outstanding: number
  state: string
  client_id: string | number
  currency: string
  lines: MazeedOneLine[]
  [key: string]: unknown
}

function mapStatus(state: string): InvoiceStatus {
  switch (state) {
    case 'draft':
      return 'DRAFT'
    case 'issued':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MazeedOneLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.qty,
    totalAmount: line.total,
    taxAmount: line.vat_amount || undefined,
  }
}

export function transformInvoice(raw: MazeedOneInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.state),
    invoiceNumber: raw.invoice_no || undefined,
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.outstanding,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
