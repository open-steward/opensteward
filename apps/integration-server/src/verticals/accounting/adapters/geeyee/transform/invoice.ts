import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface GeeyeeInvoiceLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface GeeyeeInvoice {
  id?: string
  billNo?: string
  billDate?: string
  dueDate?: string
  totalAmt?: number
  taxAmt?: number
  billStatus?: string
  partnerId?: string
  currency?: string
  lines?: GeeyeeInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): InvoiceStatus {
  switch (s) {
    case 'paid': return 'PAID'
    case 'approved': return 'AUTHORIZED'
    case 'cancelled': return 'VOIDED'
    case 'draft': return 'DRAFT'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: GeeyeeInvoice): Invoice {
  return {
    id: raw.id ? String(raw.id) : undefined,
    type: 'INVOICE',
    status: mapStatus(raw.billStatus),
    invoiceNumber: raw.billNo || undefined,
    contactId: raw.partnerId ? String(raw.partnerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmt,
    taxAmount: raw.taxAmt,
    balanceAmount: raw.totalAmt,
    postedAt: raw.billDate ? new Date(raw.billDate) : undefined,
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
