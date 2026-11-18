import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FenbeitongInvoiceLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface FenbeitongInvoice {
  expenseId?: string
  expenseNo?: string
  expenseDate?: string
  dueDate?: string
  totalAmount?: number
  taxAmount?: number
  status?: string
  applyerId?: string
  currency?: string
  lines?: FenbeitongInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): InvoiceStatus {
  switch (s) {
    case 'paid': return 'PAID'
    case 'approved': return 'AUTHORIZED'
    case 'rejected': return 'VOIDED'
    case 'pending': return 'DRAFT'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: FenbeitongInvoice): Invoice {
  return {
    id: raw.expenseId ? String(raw.expenseId) : undefined,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.expenseNo || undefined,
    contactId: raw.applyerId ? String(raw.applyerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.totalAmount,
    postedAt: raw.expenseDate ? new Date(raw.expenseDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.taxAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
