import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FAInvoiceLine {
  id?: number | string
  stock_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  amount?: number
  tax_amount?: number
  account_id?: string | number
  [key: string]: unknown
}

export interface FAInvoice {
  id: number | string
  reference?: string
  tran_date?: string
  due_date?: string
  debtor_no?: number | string
  curr_code?: string
  total?: number
  tax_total?: number
  balance?: number
  status?: number | string
  lines?: FAInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status?: number | string): InvoiceStatus {
  const s = Number(status)
  switch (s) {
    case 0:
      return 'DRAFT'
    case 1:
      return 'AUTHORIZED'
    case 2:
      return 'PAID'
    case 3:
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: FAInvoiceLine): Lineitem {
  return {
    itemId: line.stock_id || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.amount ?? 0,
    taxAmount: line.tax_amount || undefined,
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
  }
}

export function transformInvoice(raw: FAInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.reference || undefined,
    contactId: raw.debtor_no !== undefined ? String(raw.debtor_no) : undefined,
    currency: raw.curr_code || undefined,
    totalAmount: raw.total ?? 0,
    taxAmount: raw.tax_total ?? 0,
    balanceAmount: raw.balance,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.tran_date ? new Date(raw.tran_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
