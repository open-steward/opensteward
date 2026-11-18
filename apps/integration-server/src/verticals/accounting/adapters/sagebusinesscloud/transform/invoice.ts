import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface SageLineItem {
  id?: string
  description?: string
  quantity?: number
  unit_price?: number
  net_amount?: number
  tax_amount?: number
  ledger_account?: { id?: string }
  [key: string]: unknown
}

export interface SageInvoice {
  id: string
  invoice_number?: string
  date?: string
  due_date?: string
  net_amount?: number
  tax_amount?: number
  total_amount?: number
  outstanding_amount?: number
  status?: { id?: string }
  contact?: { id?: string }
  currency?: { id?: string }
  line_items?: SageLineItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status) {
    case 'DRAFT': return 'DRAFT'
    case 'SUBMITTED': return 'AUTHORIZED'
    case 'AUTHORISED': return 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'VOID': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(item: SageLineItem): Lineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    accountId: item.ledger_account?.id || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.net_amount ?? 0,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformInvoice(raw: SageInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.status?.id),
    invoiceNumber: raw.invoice_number || raw.id,
    contactId: raw.contact?.id || undefined,
    currency: raw.currency?.id || undefined,
    totalAmount: raw.total_amount ?? 0,
    taxAmount: raw.tax_amount ?? 0,
    balanceAmount: raw.outstanding_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
