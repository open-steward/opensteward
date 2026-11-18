import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface PromikBookInvoiceLine {
  id?: number | string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  vat?: number
  account_no?: string | number
  [key: string]: unknown
}

export interface PromikBookInvoice {
  id: number | string
  invoice_no?: string
  date?: string
  due_date?: string
  amount_excl_vat?: number
  vat_amount?: number
  amount_incl_vat?: number
  unpaid?: number
  status?: string
  contact_id?: number | string
  currency?: string
  lines?: PromikBookInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(raw: PromikBookInvoice): InvoiceStatus {
  switch (raw.status?.toLowerCase()) {
    case 'paid':
      return 'PAID'
    case 'active':
      return 'AUTHORIZED'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: PromikBookInvoiceLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account_no !== undefined ? String(line.account_no) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
    taxAmount: line.vat || undefined,
  }
}

export function transformInvoice(raw: PromikBookInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_no || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_incl_vat,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.unpaid,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
