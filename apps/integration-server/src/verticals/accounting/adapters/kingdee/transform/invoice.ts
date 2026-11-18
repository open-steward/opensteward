import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface KingdeeInvoiceLine {
  id?: string
  description?: string
  price?: number
  qty?: number
  amount?: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface KingdeeInvoice {
  id?: string
  billId?: string
  billNo?: string
  billDate?: string
  dueDate?: string
  totalAmount?: number
  taxAmount?: number
  custId?: string
  currId?: string
  status?: string
  lines?: KingdeeInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): InvoiceStatus {
  switch (s) {
    case 'A': return 'AUTHORIZED'
    case 'B': return 'PAID'
    case 'C': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: KingdeeInvoice): Invoice {
  return {
    id: raw.id ? String(raw.id) : raw.billId ? String(raw.billId) : undefined,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.billNo || undefined,
    contactId: raw.custId ? String(raw.custId) : undefined,
    currency: raw.currId || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.totalAmount,
    postedAt: raw.billDate ? new Date(raw.billDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.qty,
      totalAmount: l.amount,
      taxAmount: l.taxAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
